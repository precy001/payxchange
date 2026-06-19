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
}
