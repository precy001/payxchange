import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  TransferResult,
} from '../payments/payment-provider.interface';
import { UsersRepository } from '../users/users.repository';
import { PayoutDestinationsRepository } from '../payout-destinations/payout-destinations.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionRow, TransactionsRepository } from './transactions.repository';

// The payout leg of the saga, built to survive the real world:
//   - Requery BEFORE retry: an UNKNOWN result (timeout) is never assumed failed.
//     We ask the provider "did this actually go through?" before doing anything.
//   - Retry with backoff: a clean failure is retried a few times, spaced out.
//   - Compensation: if it permanently fails, the payer is automatically
//     REFUNDED (reversing -> reversed). Money is never left in limbo.
// Every move is guarded by the state machine + version lock, so running twice
// can't double-pay or double-refund.
//
// runOne returns `true` when the transaction has reached a terminal state and
// the outbox event can be published; `false` means "come back next tick".

const MAX_ATTEMPTS = 3;
const retryDelayMs = (attemptsSoFar: number) => attemptsSoFar * 5000; // 5s, 10s, ...

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly txns: TransactionsRepository,
    private readonly users: UsersRepository,
    private readonly payoutDestinations: PayoutDestinationsRepository,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // Fire "you received" to the payee and "payment successful" to the payer.
  // Best-effort; never blocks or fails the payout.
  private async notifyCompletion(txn: TransactionRow) {
    try {
      const [payer, payee] = await Promise.all([
        this.users.findById(txn.payer_user_id),
        this.users.findById(txn.payee_user_id),
      ]);
      const amount = `₦${(Number(txn.amount_kobo) / 100).toLocaleString('en-US')}`;
      await this.notifications.notifyUser(
        txn.payee_user_id,
        'Money received',
        `You received ${amount} from ${payer?.full_name ?? 'a PayXchange user'}`,
        { transactionId: txn.id },
      );
      await this.notifications.notifyUser(
        txn.payer_user_id,
        'Payment successful',
        `You sent ${amount} to ${payee?.full_name ?? 'a PayXchange user'}`,
        { transactionId: txn.id },
      );
    } catch {
      // notifications are non-critical
    }
  }

  async runOne(transactionId: string): Promise<boolean> {
    const txn = await this.txns.findById(transactionId);
    if (!txn) return true; // nothing to do — drop the event

    switch (txn.state) {
      case 'completed':
      case 'reversed':
      case 'failed':
        return true; // terminal
      case 'payer_charged': {
        const moved = await this.db.withTransaction((c) =>
          this.txns.transition(c, transactionId, 'payer_charged', 'payout_pending', txn.version),
        );
        if (!moved) return false;
        return this.attempt(moved);
      }
      case 'payout_pending':
        return this.resume(txn);
      case 'payout_failed':
      case 'reversing':
        return this.compensate(txn);
      default:
        return false;
    }
  }

  // Make a fresh transfer attempt for a transaction already in payout_pending.
  private async attempt(txn: TransactionRow): Promise<boolean> {
    const payoutRef = `payout_${txn.id}_${Date.now()}`;
    let attemptId = '';
    await this.db.withTransaction(async (c) => {
      attemptId = await this.txns.createPayoutAttempt(c, txn.id, payoutRef, txn.amount_kobo);
    });

    const payee = await this.users.findById(txn.payee_user_id);
    // Pay into the payee's saved, verified bank account. (The Receive flow blocks
    // generating a QR until they have one, so this should always exist.) The env
    // values remain only as a last-resort fallback for older/test data.
    const dest = await this.payoutDestinations.getDefault(txn.payee_user_id);
    const result = await this.provider.transferToBank({
      amountKobo: Number(txn.amount_kobo),
      accountNumber: dest?.account_number ?? process.env.PAYOUT_TEST_ACCOUNT ?? '0000000000',
      bankCode: dest?.bank_code ?? process.env.PAYOUT_TEST_BANK_CODE ?? '000',
      accountName: dest?.account_name ?? process.env.PAYOUT_TEST_ACCOUNT_NAME ?? payee?.full_name ?? 'PayXchange user',
      reference: payoutRef,
      narration: 'PayXchange payout',
    });

    return this.applyResult(txn, attemptId, result);
  }

  // Resume a payout_pending transaction that already has attempts.
  private async resume(txn: TransactionRow): Promise<boolean> {
    const attempts = await this.txns.getPayoutAttempts(txn.id);
    const latest = attempts[0];
    if (!latest) return this.attempt(txn);

    // Backoff: space out work for this transaction.
    const since = Date.now() - new Date(latest.created_at).getTime();
    if (since < retryDelayMs(attempts.length)) return false;

    // An unresolved (UNKNOWN) attempt must be requeried before anything else.
    if (latest.status === 'sent') {
      const rq = await this.provider.requeryTransfer(latest.payout_ref);
      await this.db.withTransaction((c) => this.txns.bumpRequery(c, latest.id));
      if (rq.status === 'success') return this.applyResult(txn, latest.id, rq);
      if (rq.status === 'failed') {
        await this.db.withTransaction((c) => this.txns.markPayoutAttempt(c, latest.id, 'failed'));
        return attempts.length >= MAX_ATTEMPTS ? this.escalate(txn) : false;
      }
      return false; // still unknown — wait and requery again
    }

    // Latest attempt failed: retry, or give up and refund.
    if (attempts.length >= MAX_ATTEMPTS) return this.escalate(txn);
    return this.attempt(txn);
  }

  private async applyResult(
    txn: TransactionRow,
    attemptId: string,
    result: TransferResult,
  ): Promise<boolean> {
    if (result.status === 'success') {
      let completed = false;
      await this.db.withTransaction(async (c) => {
        const sent = await this.txns.transition(c, txn.id, 'payout_pending', 'payout_sent', txn.version);
        if (!sent) return;
        const done = await this.txns.transition(c, txn.id, 'payout_sent', 'completed', sent.version);
        if (!done) return;
        await this.txns.writeLedger(c, txn.id, [
          { account: 'platform:settlement', direction: 'debit', amountKobo: txn.amount_kobo },
          { account: `payee:${txn.payee_user_id}`, direction: 'credit', amountKobo: txn.amount_kobo },
        ]);
        await this.txns.markPayoutAttempt(c, attemptId, 'success', result.sessionId ?? null);
        completed = true;
      });
      if (completed) {
        this.logger.log(`Transaction ${txn.id} completed — payout sent`);
        await this.notifyCompletion(txn);
      }
      return true;
    }

    if (result.status === 'failed') {
      await this.db.withTransaction((c) => this.txns.markPayoutAttempt(c, attemptId, 'failed'));
      const count = (await this.txns.getPayoutAttempts(txn.id)).length;
      this.logger.warn(`Transaction ${txn.id} payout attempt failed (${count}/${MAX_ATTEMPTS})`);
      return count >= MAX_ATTEMPTS ? this.escalate(txn) : false;
    }

    // unknown — leave it for a requery on the next tick
    await this.db.withTransaction((c) => this.txns.markPayoutAttempt(c, attemptId, 'sent'));
    this.logger.warn(`Transaction ${txn.id} payout result unknown — will requery`);
    return false;
  }

  // payout_pending -> payout_failed, then compensate.
  private async escalate(txn: TransactionRow): Promise<boolean> {
    const failed = await this.db.withTransaction((c) =>
      this.txns.transition(c, txn.id, 'payout_pending', 'payout_failed', txn.version),
    );
    const current = failed ?? (await this.txns.findById(txn.id));
    if (!current) return true;
    return this.compensate(current);
  }

  // Refund the payer: reverse the original charge so money is never stranded.
  private async compensate(input: TransactionRow): Promise<boolean> {
    let txn: TransactionRow | null = input;

    if (txn.state === 'payout_failed') {
      txn = (await this.db.withTransaction((c) =>
        this.txns.transition(c, txn!.id, 'payout_failed', 'reversing', txn!.version),
      )) ?? (await this.txns.findById(input.id));
    }
    if (!txn) return true;

    if (txn.state === 'reversing') {
      await this.db.withTransaction(async (c) => {
        const done = await this.txns.transition(c, txn!.id, 'reversing', 'reversed', txn!.version);
        if (!done) return;
        // Reverse the charge leg: settlement debited, payer credited back.
        await this.txns.writeLedger(c, txn!.id, [
          { account: 'platform:settlement', direction: 'debit', amountKobo: txn!.amount_kobo },
          { account: `payer:${txn!.payer_user_id}`, direction: 'credit', amountKobo: txn!.amount_kobo },
        ]);
      });
      this.logger.log(`Transaction ${input.id} reversed — payer refunded`);
    }
    return true;
  }

  // ---- Webhook-driven resolution (async provider results) -------------------
  // Real bank transfers resolve asynchronously; the provider calls us back. The
  // transitions below are the SAME version-locked moves the poller uses, so the
  // webhook and the poller can never both complete or both refund a payout.

  // Provider confirmed the payout succeeded. Idempotent.
  async confirmPayoutSuccess(transactionId: string, sessionId?: string | null): Promise<void> {
    const txn = await this.txns.findById(transactionId);
    if (!txn) return;
    if (txn.state === 'completed') return; // already done — no-op

    let completed = false;
    await this.db.withTransaction(async (c) => {
      let cur: TransactionRow | null = txn;
      if (cur.state === 'payout_pending') {
        cur = await this.txns.transition(c, cur.id, 'payout_pending', 'payout_sent', cur.version);
      }
      if (cur && cur.state === 'payout_sent') {
        const done = await this.txns.transition(c, cur.id, 'payout_sent', 'completed', cur.version);
        if (!done) return; // lost the race to the poller; it completed it
        await this.txns.writeLedger(c, cur.id, [
          { account: 'platform:settlement', direction: 'debit', amountKobo: cur.amount_kobo },
          { account: `payee:${cur.payee_user_id}`, direction: 'credit', amountKobo: cur.amount_kobo },
        ]);
        completed = true;
      }
    });

    const attempts = await this.txns.getPayoutAttempts(transactionId);
    if (attempts[0]) {
      await this.db.withTransaction((c) =>
        this.txns.markPayoutAttempt(c, attempts[0].id, 'success', sessionId ?? null),
      );
    }
    this.logger.log(`Transaction ${transactionId} completed via webhook`);
    if (completed) await this.notifyCompletion(txn);
  }

  // Provider reported the payout failed. Drives the refund, idempotently.
  async failPayout(transactionId: string): Promise<void> {
    const txn = await this.txns.findById(transactionId);
    if (!txn) return;
    if (['reversed', 'completed', 'failed'].includes(txn.state)) return; // terminal

    if (txn.state === 'payout_pending') {
      const attempts = await this.txns.getPayoutAttempts(transactionId);
      if (attempts[0]) {
        await this.db.withTransaction((c) => this.txns.markPayoutAttempt(c, attempts[0].id, 'failed'));
      }
      await this.escalate(txn); // payout_failed -> reversing -> reversed
    } else if (['payout_failed', 'reversing'].includes(txn.state)) {
      await this.compensate(txn);
    } else {
      this.logger.warn(`Ignoring payout.failed for ${transactionId} in state ${txn.state}`);
      return;
    }
    this.logger.log(`Transaction ${transactionId} refunded via webhook`);
  }
}