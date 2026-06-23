import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async upsertToken(userId: string, token: string, platform?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO push_tokens (token, user_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()`,
      [token, userId, platform ?? null],
    );
  }

  async getTokensForUser(userId: string): Promise<string[]> {
    const res = await this.db.query<{ token: string }>(
      `SELECT token FROM push_tokens WHERE user_id = $1`,
      [userId],
    );
    return res.rows.map((r) => r.token);
  }

  async deleteToken(token: string): Promise<void> {
    await this.db.query(`DELETE FROM push_tokens WHERE token = $1`, [token]);
  }
}
