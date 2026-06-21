import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../infra/database.module';
import { assertTransition, TxnState } from './transaction-state';

export interface TransactionRow {
  id: string;
  payment_request_id: string;
  payer_user_id: string;
  payee_user_id: string;
  funding_source_id: string;
  payout_dest_id: string | null;
  type: string;
  amount_kobo: string; // BIGINT -> string from pg
  fee_kobo: string;
  currency: string;
  state: TxnState;
  collection_ref: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLS = `id, payment_request_id, payer_user_id, payee_user_id, funding_source_id,
              payout_dest_id, type, amount_kobo, fee_kobo, currency, state,
              collection_ref, version, created_at, updated_at`;

export interface TransactionFeedRow {
  id: string;
  amount_kobo: string;
  currency: string;
  state: TxnState;
  created_at: string;
  payer_user_id: string;
  payee_user_id: string;
  description: string | null;
  payer_name: string | null;
  payee_name: string | null;
}

export interface OutboxRow {
  id: string; // BIGSERIAL -> string from pg
  aggregate_id: string;
  event_type: string;
  payload: any;
}

export interface PayoutAttemptRow {
  id: string;
  payout_ref: string;
  status: string;
  requery_count: number;
  last_requery_at: string | null;
  created_at: string;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createPending(
    client: PoolClient,
    input: {
      paymentRequestId: string;
      payerUserId: string;
      payeeUserId: string;
      fundingSourceId: string;
      type: string;
      amountKobo: string;
      currency: string;
      collectionRef: string;
    },
  ): Promise<TransactionRow> {
    const res = await client.query<TransactionRow>(
      `INSERT INTO transactions
         (payment_request_id, payer_user_id, payee_user_id, funding_source_id,
          type, amount_kobo, currency, collection_ref, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING ${COLS}`,
      [
        input.paymentRequestId,
        input.payerUserId,
        input.payeeUserId,
        input.fundingSourceId,
        input.type,
        input.amountKobo,
        input.currency,
        input.collectionRef,
      ],
    );
    return res.rows[0];
  }

  async findById(id: string): Promise<TransactionRow | null> {
    const res = await this.db.query<TransactionRow>(
      `SELECT ${COLS} FROM transactions WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  // Transaction history for one user, as payer OR payee. Joins the payment
  // request (for the description) and both users (for counterparty names).
  async listByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<TransactionFeedRow[]> {
    const res = await this.db.query<TransactionFeedRow>(
      `SELECT t.id, t.amount_kobo, t.currency, t.state, t.created_at,
              t.payer_user_id, t.payee_user_id,
              pr.description AS description,
              payer.full_name AS payer_name,
              payee.full_name AS payee_name
         FROM transactions t
         LEFT JOIN payment_requests pr ON pr.id = t.payment_request_id
         LEFT JOIN users payer ON payer.id = t.payer_user_id
         LEFT JOIN users payee ON payee.id = t.payee_user_id
        WHERE t.payer_user_id = $1 OR t.payee_user_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return res.rows;
  }

  // Transactions stuck unconfirmed (scanned but never approved) past a cutoff.
  async findStaleUnconfirmed(
    minutes: number,
  ): Promise<Array<{ id: string; state: TxnState; version: number }>> {
    const res = await this.db.query<{ id: string; state: TxnState; version: number }>(
      `SELECT id, state, version
         FROM transactions
        WHERE state IN ('pending', 'authorized')
          AND created_at < now() - ($1 * interval '1 minute')
        ORDER BY created_at ASC
        LIMIT 100`,
      [minutes],
    );
    return res.rows;
  }

  // The guarded transition. Two layers of protection:
  //   1. assertTransition() rejects illegal moves (programmer error).
  //   2. The SQL WHERE clause (state = from AND version = expected) is the
  //      OPTIMISTIC LOCK — if another request changed the row first, 0 rows
  //      update and we know we lost the race, so we don't double-apply.
  // Returns the updated row, or null if the guard failed.
  async transition(
    client: PoolClient,
    id: string,
    from: TxnState,
    to: TxnState,
    expectedVersion: number,
  ): Promise<TransactionRow | null> {
    assertTransition(from, to);
    const res = await client.query<TransactionRow>(
      `UPDATE transactions
          SET state = $3, version = version + 1, updated_at = now()
        WHERE id = $1 AND state = $2 AND version = $4
      RETURNING ${COLS}`,
      [id, from, to, expectedVersion],
    );
    return res.rows[0] ?? null;
  }

  // Append the double-entry ledger rows for a transaction. Caller must ensure
  // the entries balance (sum of debits == sum of credits).
  async writeLedger(
    client: PoolClient,
    transactionId: string,
    entries: Array<{ account: string; direction: 'debit' | 'credit'; amountKobo: string }>,
  ): Promise<void> {
    for (const e of entries) {
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account, direction, amount_kobo)
         VALUES ($1, $2, $3, $4)`,
        [transactionId, e.account, e.direction, e.amountKobo],
      );
    }
  }

  // ---- Transactional outbox -------------------------------------------------
  // Written in the SAME db transaction as the state change it describes, so the
  // job exists if-and-only-if the business change committed. A separate poller
  // publishes it. This is the exactly-once-ish backbone of the payout saga.
  async insertOutbox(
    client: PoolClient,
    aggregateId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)`,
      [aggregateId, eventType, JSON.stringify(payload)],
    );
  }

  async fetchUnpublishedOutbox(limit = 20): Promise<OutboxRow[]> {
    const res = await this.db.query<OutboxRow>(
      `SELECT id, aggregate_id, event_type, payload
         FROM outbox
        WHERE published_at IS NULL
        ORDER BY id ASC
        LIMIT $1`,
      [limit],
    );
    return res.rows;
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.db.query(`UPDATE outbox SET published_at = now() WHERE id = $1`, [id]);
  }

  // Feed rows for one user within a date range (used by the monthly summary).
  async listByUserForMonth(
    userId: string,
    startISO: string,
    endISO: string,
  ): Promise<TransactionFeedRow[]> {
    const res = await this.db.query<TransactionFeedRow>(
      `SELECT t.id, t.amount_kobo, t.currency, t.state, t.created_at,
              t.payer_user_id, t.payee_user_id,
              pr.description AS description,
              payer.full_name AS payer_name,
              payee.full_name AS payee_name
         FROM transactions t
         LEFT JOIN payment_requests pr ON pr.id = t.payment_request_id
         LEFT JOIN users payer ON payer.id = t.payer_user_id
         LEFT JOIN users payee ON payee.id = t.payee_user_id
        WHERE (t.payer_user_id = $1 OR t.payee_user_id = $1)
          AND t.created_at >= $2 AND t.created_at < $3
        ORDER BY t.created_at DESC`,
      [userId, startISO, endISO],
    );
    return res.rows;
  }

  // ---- Payout attempts ------------------------------------------------------
  async createPayoutAttempt(
    client: PoolClient,
    transactionId: string,
    payoutRef: string,
    amountKobo: string,
  ): Promise<string> {
    const res = await client.query<{ id: string }>(
      `INSERT INTO payout_attempts (transaction_id, payout_ref, amount_kobo, status)
       VALUES ($1, $2, $3, 'initiated')
       RETURNING id`,
      [transactionId, payoutRef, amountKobo],
    );
    return res.rows[0].id;
  }

  async markPayoutAttempt(
    client: PoolClient,
    id: string,
    status: string,
    sessionId?: string | null,
  ): Promise<void> {
    await client.query(
      `UPDATE payout_attempts
          SET status = $2, nip_session_id = COALESCE($3, nip_session_id)
        WHERE id = $1`,
      [id, status, sessionId ?? null],
    );
  }

  async getPayoutAttempts(transactionId: string): Promise<PayoutAttemptRow[]> {
    const res = await this.db.query<PayoutAttemptRow>(
      `SELECT id, payout_ref, status, requery_count, last_requery_at, created_at
         FROM payout_attempts
        WHERE transaction_id = $1
        ORDER BY created_at DESC`,
      [transactionId],
    );
    return res.rows;
  }

  async bumpRequery(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE payout_attempts
          SET requery_count = requery_count + 1, last_requery_at = now()
        WHERE id = $1`,
      [id],
    );
  }
}