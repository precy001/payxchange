import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../infra/redis.module';
import { DatabaseService } from '../infra/database.module';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../payments/payment-provider.interface';
import { FundingSourcesRepository } from '../funding-sources/funding-sources.repository';
import { PaymentRequestsRepository } from '../payment-requests/payment-requests.repository';
import { UsersRepository } from '../users/users.repository';
import { TransactionRow, TransactionsRepository } from './transactions.repository';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly txns: TransactionsRepository,
    private readonly funding: FundingSourcesRepository,
    private readonly requests: PaymentRequestsRepository,
    private readonly users: UsersRepository,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ---- INITIATE: payer scans -> PENDING transaction -------------------------
  async initiate(input: { token: string; payerUserId: string; fundingSourceId: string }) {
    // Resolve the scanned token to a payment request (fast path via Redis).
    const requestId = await this.redis.get(`qr:${input.token}`);
    if (!requestId) {
      throw new GoneException('This code is invalid, used, or expired');
    }

    // The card must exist, belong to the payer, and be active.
    const fs = await this.funding.findById(input.fundingSourceId);
    if (!fs || fs.user_id !== input.payerUserId) {
      throw new ForbiddenException('That payment method does not belong to you');
    }
    if (fs.status !== 'active') {
      throw new BadRequestException('That payment method is not active');
    }

    const txn = await this.db.withTransaction(async (client) => {
      // Authoritative single-use guard: lock the request row, then consume it.
      const pr = await this.requests.lockForConsume(client, requestId);
      if (!pr) throw new GoneException('This code is no longer valid');
      if (pr.consumed_at) throw new GoneException('This code has already been used');
      if (new Date(pr.expires_at).getTime() < Date.now()) {
        throw new GoneException('This code has expired');
      }
      if (pr.payee_user_id === input.payerUserId) {
        throw new BadRequestException('You cannot pay yourself');
      }

      await this.requests.markConsumed(client, requestId);

      // collection_ref is our idempotency anchor at the provider: charging the
      // same ref twice is a no-op there, so even a duplicated confirm is safe.
      const collectionRef = `col_${crypto.randomBytes(12).toString('hex')}`;

      return this.txns.createPending(client, {
        paymentRequestId: pr.id,
        payerUserId: input.payerUserId,
        payeeUserId: pr.payee_user_id,
        fundingSourceId: fs.id,
        type: pr.type,
        amountKobo: pr.amount_kobo,
        currency: pr.currency,
        collectionRef,
      });
    });

    // Best-effort cleanup; the DB consume above is the real guard.
    await this.redis.del(`qr:${input.token}`).catch(() => undefined);

    return this.toPublic(txn);
  }

  // ---- CONFIRM: payer approves -> charge -> PAYER_CHARGED + ledger ----------
  async confirm(id: string) {
    // Per-transaction mutex: stops two concurrent confirms from BOTH reaching
    // the charge step (which would charge the card twice while recording it
    // once). The TTL guarantees the lock can't get stuck if a process dies.
    const lockKey = `lock:confirm:${id}`;
    const gotLock = await this.redis.set(lockKey, '1', 'PX', 15_000, 'NX');
    if (!gotLock) {
      throw new ConflictException('A confirmation for this transaction is already in progress');
    }
    try {
      return await this.runConfirm(id);
    } finally {
      await this.redis.del(lockKey).catch(() => undefined);
    }
  }

  private async runConfirm(id: string) {
    let txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('Transaction not found');

    // Idempotent: if it's already charged, just return it.
    if (txn.state === 'payer_charged') return this.toPublic(txn);
    if (txn.state === 'failed') {
      throw new HttpException('This transaction already failed', HttpStatus.CONFLICT);
    }
    if (txn.state !== 'pending' && txn.state !== 'authorized') {
      throw new HttpException(`Cannot confirm a ${txn.state} transaction`, HttpStatus.CONFLICT);
    }

    // Step 1 (short DB tx): move PENDING -> AUTHORIZED. No network call here.
    if (txn.state === 'pending') {
      await this.db.withTransaction((c) =>
        this.txns.transition(c, id, 'pending', 'authorized', txn!.version),
      );
      txn = await this.txns.findById(id);
      if (!txn) throw new NotFoundException('Transaction not found');
      if (txn.state === 'payer_charged') return this.toPublic(txn); // a concurrent confirm won
    }

    // Step 2 (NO db lock held): charge the card through the provider. The
    // provider dedupes on collection_ref, so this is safe to retry.
    const fs = await this.funding.findById(txn.funding_source_id);
    const payer = await this.users.findById(txn.payer_user_id);
    const charge = await this.provider.chargeTokenizedCard({
      amountKobo: Number(txn.amount_kobo),
      currency: txn.currency,
      customerEmail: payer?.email ?? 'unknown@scanpay.local',
      tokenKey: fs!.squad_ref,
      reference: txn.collection_ref,
    });

    // Step 3 (short DB tx): record the outcome.
    if (charge.success) {
      const versionAtAuth = txn.version;
      const result = await this.db.withTransaction(async (c) => {
        const moved = await this.txns.transition(c, id, 'authorized', 'payer_charged', versionAtAuth);
        if (!moved) {
          // A concurrent confirm already charged + wrote the ledger. Don't
          // write it twice; just report the current row.
          return null;
        }
        // Double-entry: payer is debited, our settlement account is credited.
        await this.txns.writeLedger(c, id, [
          { account: `payer:${moved.payer_user_id}`, direction: 'debit', amountKobo: moved.amount_kobo },
          { account: 'platform:settlement', direction: 'credit', amountKobo: moved.amount_kobo },
        ]);
        return moved;
      });
      const finalRow = result ?? (await this.txns.findById(id))!;
      this.logger.log(`Transaction ${id} charged (${charge.providerReference})`);
      return this.toPublic(finalRow);
    }

    // Charge failed: mark FAILED and tell the client.
    await this.db.withTransaction((c) =>
      this.txns.transition(c, id, 'authorized', 'failed', txn!.version),
    );
    throw new HttpException(
      { message: 'Card charge was declined', transactionId: id, state: 'failed' },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async getById(id: string) {
    const txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('Transaction not found');
    return this.toPublic(txn);
  }

  private toPublic(t: TransactionRow) {
    return {
      id: t.id,
      state: t.state,
      type: t.type,
      amountKobo: Number(t.amount_kobo),
      currency: t.currency,
      payerUserId: t.payer_user_id,
      payeeUserId: t.payee_user_id,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }
}