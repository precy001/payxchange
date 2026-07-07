import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface PayoutDestinationRow {
  id: string;
  user_id: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  verified_at: string;
  is_default: boolean;
  created_at: string;
}

const COLS = `id, user_id, bank_code, account_number, account_name, verified_at, is_default, created_at`;

@Injectable()
export class PayoutDestinationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async countForUser(userId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM payout_destinations WHERE user_id = $1`,
      [userId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  async listByUser(userId: string): Promise<PayoutDestinationRow[]> {
    const res = await this.db.query<PayoutDestinationRow>(
      `SELECT ${COLS} FROM payout_destinations WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async getDefault(userId: string): Promise<PayoutDestinationRow | null> {
    const res = await this.db.query<PayoutDestinationRow>(
      `SELECT ${COLS} FROM payout_destinations WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [userId],
    );
    return res.rows[0] ?? null;
  }

  async upsert(input: {
    userId: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    isDefault: boolean;
  }): Promise<PayoutDestinationRow> {
    // Only one default per user — clear the flag first if this one is default.
    if (input.isDefault) {
      await this.db.query(
        `UPDATE payout_destinations SET is_default = false WHERE user_id = $1 AND is_default = true`,
        [input.userId],
      );
    }
    const res = await this.db.query<PayoutDestinationRow>(
      `INSERT INTO payout_destinations (user_id, bank_code, account_number, account_name, is_default)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, bank_code, account_number)
       DO UPDATE SET account_name = EXCLUDED.account_name, is_default = EXCLUDED.is_default, verified_at = now()
       RETURNING ${COLS}`,
      [input.userId, input.bankCode, input.accountNumber, input.accountName, input.isDefault],
    );
    return res.rows[0];
  }

  async makeDefault(userId: string, id: string): Promise<void> {
    await this.db.query(
      `UPDATE payout_destinations SET is_default = false WHERE user_id = $1 AND is_default = true`,
      [userId],
    );
    await this.db.query(
      `UPDATE payout_destinations SET is_default = true WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM payout_destinations WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
