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
import { computeFeeKobo } from './fees';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../payments/payment-provider.interface';
import { FundingSourcesRepository } from '../funding-sources/funding-sources.repository';
import { PaymentRequestsRepository } from '../payment-requests/payment-requests.repository';
import { UsersRepository } from '../users/users.repository';
import { AuthService } from '../auth/auth.service';
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
    private readonly auth: AuthService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ---- INITIATE: payer scans -> PENDING transaction -------------------------
  async initiate(input: { token: string; payerUserId: string; fundingSourceId?: string }) {
    // A frozen account cannot move money.
    const payer = await this.users.findById(input.payerUserId);
    if (payer?.frozen_at) {
      throw new ForbiddenException('Your account is frozen. Unfreeze it to make payments.');
    }

    // Resolve the scanned token to a payment request (fast path via Redis).
    const requestId = await this.redis.get(`qr:${input.token}`);
    if (!requestId) {
      throw new GoneException('This code is invalid, used, or expired');
    }

    // A saved card is optional. If one is given it must belong to the payer and
    // be active (that's the silent auto-charge path). If none is given, this is a
    // first-time payment that will capture a card via hosted checkout.
    let fsId: string | null = null;
    if (input.fundingSourceId) {
      const fs = await this.funding.findById(input.fundingSourceId);
      if (!fs || fs.user_id !== input.payerUserId) {
        throw new ForbiddenException('That payment method does not belong to you');
      }
      if (fs.status !== 'active') {
        throw new BadRequestException('That payment method is not active');
      }
      fsId = fs.id;
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
        fundingSourceId: fsId,
        type: pr.type,
        amountKobo: pr.amount_kobo,
        feeKobo: String(computeFeeKobo(Number(pr.amount_kobo))),
        currency: pr.currency,
        collectionRef,
      });
    });

    // Best-effort cleanup; the DB consume above is the real guard.
    await this.redis.del(`qr:${input.token}`).catch(() => undefined);

    return this.toPublic(txn);
  }

  // ---- CONFIRM: payer approves -> charge -> PAYER_CHARGED + ledger ----------
  async confirm(id: string, userId: string, pin: string) {
    // Per-transaction mutex: stops two concurrent confirms from BOTH reaching
    // the charge step (which would charge the card twice while recording it
    // once). The TTL guarantees the lock can't get stuck if a process dies.
    const lockKey = `lock:confirm:${id}`;
    const gotLock = await this.redis.set(lockKey, '1', 'PX', 15_000, 'NX');
    if (!gotLock) {
      throw new ConflictException('A confirmation for this transaction is already in progress');
    }
    try {
      return await this.runConfirm(id, userId, pin);
    } finally {
      await this.redis.del(lockKey).catch(() => undefined);
    }
  }

  private async runConfirm(id: string, userId: string, pin: string) {
    let txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('Transaction not found');

    // Only the payer may confirm their own transaction.
    if (txn.payer_user_id !== userId) {
      throw new ForbiddenException('You cannot confirm this transaction');
    }

    // Step-up authorization: the PIN must be re-entered to move money. This
    // also enforces lockout, so a stolen unlocked phone can't drain the card.
    await this.auth.verifyPinOrThrow(userId, pin);

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

    // Step 2: the inbound payment.
    const payer = await this.users.findById(txn.payer_user_id);

    if (this.provider.usesHostedCheckout) {
      // If the payer has a saved card, charge it silently — no WebView. This is
      // the automatic path for every payment after the first.
      if (txn.funding_source_id) {
        const fs = await this.funding.findById(txn.funding_source_id);
        if (fs?.squad_ref) {
          const charge = await this.provider.chargeTokenizedCard({
            amountKobo: Number(txn.amount_kobo) + Number(txn.fee_kobo),
            currency: txn.currency,
            customerEmail: payer?.email ?? 'payer@payxchange.app',
            tokenKey: fs.squad_ref,
            reference: txn.collection_ref,
          });
          if (charge.success) {
            return this.applyCharge(id, charge.providerReference, txn.version);
          }
          await this.db.withTransaction((c) =>
            this.txns.transition(c, id, 'authorized', 'failed', txn!.version),
          );
          throw new HttpException(
            { message: 'Your saved card could not be charged', transactionId: id, state: 'failed' },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      // No saved card → hosted checkout to capture one. The charge is confirmed
      // by verifyAndCharge (or the webhook), which also saves the card.
      const publicBase = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
      const order = await this.provider.createCheckoutOrder({
        amountKobo: Number(txn.amount_kobo) + Number(txn.fee_kobo),
        currency: txn.currency,
        customerEmail: payer?.email ?? 'payer@payxchange.app',
        orderReference: txn.collection_ref,
        callbackUrl: `${publicBase}/webhooks/nomba`,
      });
      // Map the order back to this txn so the webhook can find it (TTL 1h).
      await this.redis.set(`nomba:order:${txn.collection_ref}`, id, 'EX', 3600);
      this.logger.log(`Transaction ${id} awaiting checkout payment (${txn.collection_ref})`);
      return { ...this.toPublic(txn), checkoutUrl: order.checkoutUrl };
    }

    // Synchronous charge (mock / token providers). Dedupes on collection_ref.
    const fs = txn.funding_source_id ? await this.funding.findById(txn.funding_source_id) : null;
    const charge = await this.provider.chargeTokenizedCard({
      amountKobo: Number(txn.amount_kobo) + Number(txn.fee_kobo),
      currency: txn.currency,
      customerEmail: payer?.email ?? 'unknown@scanpay.local',
      tokenKey: fs?.squad_ref ?? 'mock',
      reference: txn.collection_ref,
    });

    if (charge.success) {
      return this.applyCharge(id, charge.providerReference, txn.version);
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

  // The "charge succeeded" effect: AUTHORIZED -> PAYER_CHARGED + ledger + queue
  // the payout. Idempotent (the transition returns null if already applied), so
  // the webhook may safely call it even if Nomba fires twice.
  private async applyCharge(id: string, providerReference: string, versionAtAuth?: number) {
    const current = await this.txns.findById(id);
    if (!current) throw new NotFoundException('Transaction not found');
    if (['payer_charged', 'payout_pending', 'payout_sent', 'completed'].includes(current.state)) {
      return this.toPublic(current); // already charged
    }
    const version = versionAtAuth ?? current.version;
    const result = await this.db.withTransaction(async (c) => {
      const moved = await this.txns.transition(c, id, 'authorized', 'payer_charged', version);
      if (!moved) return null;
      // Double-entry: payer is debited amount + fee; the amount goes to our
      // settlement account (to be paid out to the payee) and the fee to our
      // fee-income account. Debits and credits balance.
      const amount = Number(moved.amount_kobo);
      const fee = Number(moved.fee_kobo);
      const entries = [
        { account: `payer:${moved.payer_user_id}`, direction: 'debit' as const, amountKobo: String(amount + fee) },
        { account: 'platform:settlement', direction: 'credit' as const, amountKobo: String(amount) },
      ];
      if (fee > 0) {
        entries.push({ account: 'platform:fees', direction: 'credit' as const, amountKobo: String(fee) });
      }
      await this.txns.writeLedger(c, id, entries);
      // Transactional outbox: queue the payout leg, committed with the charge.
      await this.txns.insertOutbox(c, id, 'payout.requested', {
        transactionId: id,
        amountKobo: moved.amount_kobo,
      });
      return moved;
    });
    const finalRow = result ?? (await this.txns.findById(id))!;
    this.logger.log(`Transaction ${id} charged (${providerReference})`);
    return this.toPublic(finalRow);
  }

  // Called by the webhook when the hosted checkout reports success. Optionally
  // carries the reusable card to save for future auto-charges.
  async chargeFromCheckout(orderReference: string, card?: { token: string; brand?: string; last4?: string }) {
    const id = await this.redis.get(`nomba:order:${orderReference}`);
    if (!id) {
      this.logger.warn(`Checkout webhook for unknown order ${orderReference}`);
      return;
    }
    const txn = await this.txns.findById(id);
    await this.applyCharge(id, `checkout_${orderReference}`);
    if (card?.token && txn) {
      await this.funding.upsertCard({ userId: txn.payer_user_id, token: card.token, brand: card.brand, last4: card.last4 }).catch(() => undefined);
    }
    await this.redis.del(`nomba:order:${orderReference}`).catch(() => undefined);
  }

  // Webhook-independent confirmation: the app calls this and we ask the provider
  // directly whether the payment went through, charging (and saving the card) if
  // so. Makes confirmation reliable even when the webhook is delayed/undelivered.
  async verifyAndCharge(id: string, userId: string) {
    const txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.payer_user_id !== userId) {
      throw new ForbiddenException('You cannot verify this transaction');
    }
    if (['payer_charged', 'payout_pending', 'payout_sent', 'completed'].includes(txn.state)) {
      return this.toPublic(txn); // already charged
    }
    if (txn.state !== 'authorized') {
      return this.toPublic(txn); // failed/expired — nothing to verify
    }
    const { paid, card } = await this.provider.verifyCheckoutPayment(txn.collection_ref);
    if (paid) {
      const result = await this.applyCharge(id, `verify_${txn.collection_ref}`);
      if (card?.token) {
        // Save the card so this payer's next payment is automatic.
        await this.funding
          .upsertCard({ userId, token: card.token, brand: card.brand, last4: card.last4 })
          .catch(() => undefined);
      }
      return result;
    }
    return this.toPublic(txn); // not paid yet
  }

  async getById(id: string, userId: string) {
    const txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.payer_user_id !== userId && txn.payee_user_id !== userId) {
      throw new ForbiddenException('You cannot view this transaction');
    }
    return this.toPublic(txn);
  }

  // Transaction history for the feed, framed from the viewer's perspective.
  async listForUser(userId: string) {
    const rows = await this.txns.listByUser(userId);
    return rows.map((r) => {
      const direction = r.payer_user_id === userId ? 'sent' : 'received';
      const counterparty = direction === 'sent' ? r.payee_name : r.payer_name;
      return {
        id: r.id,
        direction,
        counterparty: counterparty ?? 'PayXchange user',
        description: r.description ?? '',
        amountKobo: Number(r.amount_kobo),
        currency: r.currency,
        state: r.state,
        createdAt: r.created_at,
      };
    });
  }

  // OPay-style monthly view: in/out totals, a weekly series for the chart, and
  // the month's transactions. `month` is 'YYYY-MM' (defaults to this month).
  async monthlySummary(userId: string, month?: string) {
    const now = new Date();
    let year = now.getUTCFullYear();
    let mon = now.getUTCMonth(); // 0-based
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      mon = m - 1;
    }
    const start = new Date(Date.UTC(year, mon, 1));
    const end = new Date(Date.UTC(year, mon + 1, 1));

    const rows = await this.txns.listByUserForMonth(userId, start.toISOString(), end.toISOString());

    let inflowKobo = 0;
    let outflowKobo = 0;
    const weeks = Array.from({ length: 5 }, () => ({ inKobo: 0, outKobo: 0 }));

    const transactions = rows.map((r) => {
      const direction = r.payer_user_id === userId ? 'sent' : 'received';
      const amt = Number(r.amount_kobo);
      const isIn = direction === 'received' && ['completed', 'payout_sent'].includes(r.state);
      const isOut =
        direction === 'sent' &&
        ['payer_charged', 'payout_pending', 'payout_sent', 'completed'].includes(r.state);
      if (isIn) inflowKobo += amt;
      if (isOut) outflowKobo += amt;

      const day = new Date(r.created_at).getUTCDate();
      const w = Math.min(4, Math.floor((day - 1) / 7));
      if (isIn) weeks[w].inKobo += amt;
      if (isOut) weeks[w].outKobo += amt;

      return {
        id: r.id,
        direction,
        counterparty: (direction === 'sent' ? r.payee_name : r.payer_name) ?? 'PayXchange user',
        description: r.description ?? '',
        amountKobo: amt,
        currency: r.currency,
        state: r.state,
        createdAt: r.created_at,
      };
    });

    return {
      month: `${year}-${String(mon + 1).padStart(2, '0')}`,
      inflowKobo,
      outflowKobo,
      count: rows.length,
      series: weeks.map((w, i) => ({ label: `W${i + 1}`, inKobo: w.inKobo, outKobo: w.outKobo })),
      transactions,
    };
  }

  private toPublic(t: TransactionRow) {
    return {
      id: t.id,
      state: t.state,
      type: t.type,
      amountKobo: Number(t.amount_kobo),
      feeKobo: Number(t.fee_kobo),
      currency: t.currency,
      payerUserId: t.payer_user_id,
      payeeUserId: t.payee_user_id,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }
}