import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string | null;
  label: string | null;
  platform: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly db: DatabaseService) {}

  // Reuse the active session for this device, or create a new one.
  // Returns the session id and whether it was newly created.
  async upsert(
    userId: string,
    deviceId: string | null,
    label: string | null,
    platform: string | null,
  ): Promise<{ id: string; isNew: boolean }> {
    if (deviceId) {
      const existing = await this.db.query<SessionRow>(
        `SELECT * FROM sessions
         WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL
         LIMIT 1`,
        [userId, deviceId],
      );
      if (existing.rows[0]) {
        await this.db.query(
          `UPDATE sessions SET last_seen_at = now(), label = COALESCE($2, label), platform = COALESCE($3, platform)
           WHERE id = $1`,
          [existing.rows[0].id, label, platform],
        );
        return { id: existing.rows[0].id, isNew: false };
      }
    }
    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO sessions (user_id, device_id, label, platform)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, deviceId, label, platform],
    );
    return { id: inserted.rows[0].id, isNew: true };
  }

  async findById(id: string): Promise<SessionRow | null> {
    const res = await this.db.query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  async listActive(userId: string): Promise<SessionRow[]> {
    const res = await this.db.query<SessionRow>(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY last_seen_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async countActive(userId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  async touch(id: string): Promise<void> {
    await this.db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [id]);
  }

  // Revoke one session (must belong to the user). Returns true if it was active.
  async revoke(userId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // Revoke every active session for a user EXCEPT the one given.
  async revokeOthers(userId: string, keepId: string): Promise<number> {
    const res = await this.db.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [userId, keepId],
    );
    return res.rowCount ?? 0;
  }
}