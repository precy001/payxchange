import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../infra/database.module';

export interface PaymentRequestRow {
  id: string;
  payee_user_id: string;
  type: string;
  amount_kobo: string;
  currency: string;
  description: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface PaymentRequestDetail extends PaymentRequestRow {
  payee_name: string | null;
}

@Injectable()
export class PaymentRequestsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    payeeUserId: string;
    type: string;
    amountKobo: number;
    description: string;
    expiresAt: Date;
  }): Promise<PaymentRequestRow> {
    const res = await this.db.query<PaymentRequestRow>(
      `INSERT INTO payment_requests (payee_user_id, type, amount_kobo, description, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, payee_user_id, type, amount_kobo, currency, description,
                 expires_at, consumed_at, created_at`,
      [input.payeeUserId, input.type, input.amountKobo, input.description, input.expiresAt],
    );
    return res.rows[0];
  }

  async findDetailById(id: string): Promise<PaymentRequestDetail | null> {
    const res = await this.db.query<PaymentRequestDetail>(
      `SELECT pr.id, pr.payee_user_id, pr.type, pr.amount_kobo, pr.currency,
              pr.description, pr.expires_at, pr.consumed_at, pr.created_at,
              u.full_name AS payee_name
         FROM payment_requests pr
         JOIN users u ON u.id = pr.payee_user_id
        WHERE pr.id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  // Locks the payment_request row (FOR UPDATE) and marks it consumed, inside
  // the caller's transaction. Authoritative single-use guard.
  async lockForConsume(client: PoolClient, id: string): Promise<PaymentRequestRow | null> {
    const res = await client.query<PaymentRequestRow>(
      `SELECT id, payee_user_id, type, amount_kobo, currency, description,
              expires_at, consumed_at, created_at
         FROM payment_requests
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async markConsumed(client: PoolClient, id: string): Promise<void> {
    await client.query(`UPDATE payment_requests SET consumed_at = now() WHERE id = $1`, [id]);
  }
}