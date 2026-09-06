import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../infra/database.module';

export const REWARD_THRESHOLD = 50; // qualified referrals needed
export const REWARD_NAIRA = 15000;

@Injectable()
export class ReferralsRepository {
  constructor(private readonly db: DatabaseService) {}

  // Find a user by their referral code (used at registration).
  async findUserIdByCode(code: string): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE referral_code = $1`,
      [code.trim().toUpperCase()],
    );
    return res.rows[0]?.id ?? null;
  }

  async getCode(userId: string): Promise<string | null> {
    const res = await this.db.query<{ referral_code: string | null }>(
      `SELECT referral_code FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.referral_code ?? null;
  }

  async setCode(userId: string, code: string): Promise<void> {
    await this.db.query(`UPDATE users SET referral_code = $2 WHERE id = $1`, [userId, code]);
  }

  // Records that `referredUserId` was referred by `referrerUserId`. Runs inside
  // the registration transaction. Ignores self-referral and double-referral.
  async createReferral(client: PoolClient, referrerUserId: string, referredUserId: string): Promise<void> {
    if (referrerUserId === referredUserId) return;
    await client.query(
      `INSERT INTO referrals (referrer_user_id, referred_user_id)
       VALUES ($1, $2)
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [referrerUserId, referredUserId],
    );
  }

  // Flip a referral to 'qualified' when the referred user completes a txn.
  // Only the first completion matters; later ones are a no-op.
  async markQualified(referredUserId: string): Promise<void> {
    await this.db.query(
      `UPDATE referrals
          SET status = 'qualified', qualified_at = now()
        WHERE referred_user_id = $1 AND status = 'signed_up'`,
      [referredUserId],
    );
  }

  async stats(userId: string): Promise<{ signedUp: number; qualified: number; claimedAt: string | null }> {
    const res = await this.db.query<{ signed_up: string; qualified: string }>(
      `SELECT
         COUNT(*)::int                                        AS signed_up,
         COUNT(*) FILTER (WHERE status = 'qualified')::int    AS qualified
       FROM referrals WHERE referrer_user_id = $1`,
      [userId],
    );
    const claimed = await this.db.query<{ referral_reward_claimed_at: string | null }>(
      `SELECT referral_reward_claimed_at FROM users WHERE id = $1`,
      [userId],
    );
    return {
      signedUp: Number(res.rows[0]?.signed_up ?? 0),
      qualified: Number(res.rows[0]?.qualified ?? 0),
      claimedAt: claimed.rows[0]?.referral_reward_claimed_at ?? null,
    };
  }

  async markClaimed(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET referral_reward_claimed_at = now()
        WHERE id = $1 AND referral_reward_claimed_at IS NULL`,
      [userId],
    );
  }
}
