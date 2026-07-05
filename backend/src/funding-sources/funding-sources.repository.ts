import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface FundingSourceRow {
  id: string;
  user_id: string;
  type: string;
  squad_ref: string;
  brand: string | null;
  last4: string | null;
  bank_code: string | null;
  status: string;
  is_default: boolean;
  created_at: string;
}

@Injectable()
export class FundingSourcesRepository {
  constructor(private readonly db: DatabaseService) {}

  async countForUser(userId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM funding_sources WHERE user_id = $1`,
      [userId],
    );
    return Number(res.rows[0].count);
  }

  async create(input: {
    userId: string;
    type: string;
    squadRef: string;
    brand?: string;
    last4?: string;
    isDefault: boolean;
  }): Promise<FundingSourceRow> {
    const res = await this.db.query<FundingSourceRow>(
      `INSERT INTO funding_sources (user_id, type, squad_ref, brand, last4, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, squad_ref, brand, last4, bank_code, status, is_default, created_at`,
      [input.userId, input.type, input.squadRef, input.brand ?? null, input.last4 ?? null, input.isDefault],
    );
    return res.rows[0];
  }

  async findById(id: string): Promise<FundingSourceRow | null> {
    const res = await this.db.query<FundingSourceRow>(
      `SELECT id, user_id, type, squad_ref, brand, last4, bank_code, status, is_default, created_at
         FROM funding_sources WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async listByUser(userId: string): Promise<FundingSourceRow[]> {
    const res = await this.db.query<FundingSourceRow>(
      `SELECT id, user_id, type, squad_ref, brand, last4, bank_code, status, is_default, created_at
         FROM funding_sources
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  // Save (or refresh) a captured card token. Idempotent via the
  // UNIQUE (user_id, type, squad_ref) constraint, so re-capturing is harmless.
  async upsertCard(input: {
    userId: string;
    token: string;
    brand?: string;
    last4?: string;
  }): Promise<FundingSourceRow> {
    const res = await this.db.query<FundingSourceRow>(
      `INSERT INTO funding_sources (user_id, type, squad_ref, brand, last4, status)
       VALUES ($1, 'card', $2, $3, $4, 'active')
       ON CONFLICT (user_id, type, squad_ref)
       DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, status = 'active'
       RETURNING id, user_id, type, squad_ref, brand, last4, bank_code, status, is_default, created_at`,
      [input.userId, input.token, input.brand ?? null, input.last4 ?? null],
    );
    return res.rows[0];
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM funding_sources WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}