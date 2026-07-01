import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface DisputeRow {
  id: string;
  transaction_id: string;
  user_id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

const COLS = `id, transaction_id, user_id, reason, details, status, resolution, created_at, updated_at`;

@Injectable()
export class DisputesRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    userId: string;
    transactionId: string;
    reason: string;
    details?: string | null;
  }): Promise<DisputeRow> {
    const res = await this.db.query<DisputeRow>(
      `INSERT INTO disputes (transaction_id, user_id, reason, details)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLS}`,
      [input.transactionId, input.userId, input.reason, input.details ?? null],
    );
    return res.rows[0];
  }

  // The user's most recent report for a given transaction (if any).
  async findForTransaction(userId: string, transactionId: string): Promise<DisputeRow | null> {
    const res = await this.db.query<DisputeRow>(
      `SELECT ${COLS} FROM disputes
       WHERE user_id = $1 AND transaction_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, transactionId],
    );
    return res.rows[0] ?? null;
  }

  async listByUser(userId: string): Promise<DisputeRow[]> {
    const res = await this.db.query<DisputeRow>(
      `SELECT ${COLS} FROM disputes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async findById(id: string): Promise<DisputeRow | null> {
    const res = await this.db.query<DisputeRow>(`SELECT ${COLS} FROM disputes WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  async updateStatus(id: string, status: string, resolution?: string | null): Promise<DisputeRow | null> {
    const res = await this.db.query<DisputeRow>(
      `UPDATE disputes SET status = $2, resolution = COALESCE($3, resolution), updated_at = now()
       WHERE id = $1
       RETURNING ${COLS}`,
      [id, status, resolution ?? null],
    );
    return res.rows[0] ?? null;
  }
}
