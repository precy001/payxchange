import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';
import { PER_COUNTERPARTY_DAILY_CAP, REWARD_TIMEZONE } from './daily-rewards.constants';

@Injectable()
export class DailyRewardsRepository {
  constructor(private readonly db: DatabaseService) {}

  // "Counted" transactions for `userId` for TODAY (Africa/Lagos calendar day):
  // group today's completed transactions by counterparty, cap each
  // counterparty's contribution at PER_COUNTERPARTY_DAILY_CAP, then sum.
  // Computed straight from `transactions` — no separate counter to drift.
  async countedToday(userId: string): Promise<number> {
    const res = await this.db.query<{ counted: string }>(
      `SELECT COALESCE(SUM(LEAST(cnt, $2)), 0)::int AS counted
         FROM (
           SELECT
             CASE WHEN payer_user_id = $1 THEN payee_user_id ELSE payer_user_id END AS counterparty,
             COUNT(*) AS cnt
           FROM transactions
          WHERE state = 'completed'
            AND (payer_user_id = $1 OR payee_user_id = $1)
            AND (created_at AT TIME ZONE '${REWARD_TIMEZONE}')::date
              = (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date
          GROUP BY counterparty
         ) grouped`,
      [userId, PER_COUNTERPARTY_DAILY_CAP],
    );
    return Number(res.rows[0]?.counted ?? 0);
  }

  async claimedToday(userId: string): Promise<string | null> {
    const res = await this.db.query<{ claimed_at: string }>(
      `SELECT claimed_at FROM daily_reward_claims
        WHERE user_id = $1
          AND reward_date = (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date`,
      [userId],
    );
    return res.rows[0]?.claimed_at ?? null;
  }

  // Atomic: relies on the UNIQUE(user_id, reward_date) constraint so a race
  // (double-tap, concurrent requests) can never insert two claims for the
  // same user on the same day. Returns true only if THIS call created it.
  async tryClaim(userId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO daily_reward_claims (user_id, reward_date)
       VALUES ($1, (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date)
       ON CONFLICT (user_id, reward_date) DO NOTHING
       RETURNING id`,
      [userId],
    );
    return res.rows.length > 0;
  }

  // Admin monitoring view: every user with at least one counted transaction
  // today, their running count, and whether they've claimed today.
  async adminToday(limit = 200) {
    const res = await this.db.query(
      `SELECT u.id, u.phone, u.full_name,
              COALESCE(t.counted, 0)::int AS counted,
              drc.claimed_at
         FROM users u
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(LEAST(cnt, ${PER_COUNTERPARTY_DAILY_CAP})), 0)::int AS counted
             FROM (
               SELECT
                 CASE WHEN payer_user_id = u.id THEN payee_user_id ELSE payer_user_id END AS counterparty,
                 COUNT(*) AS cnt
               FROM transactions
              WHERE state = 'completed'
                AND (payer_user_id = u.id OR payee_user_id = u.id)
                AND (created_at AT TIME ZONE '${REWARD_TIMEZONE}')::date
                  = (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date
              GROUP BY counterparty
             ) g
         ) t ON true
         LEFT JOIN daily_reward_claims drc
                ON drc.user_id = u.id
               AND drc.reward_date = (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date
        WHERE COALESCE(t.counted, 0) > 0
        ORDER BY counted DESC
        LIMIT $1`,
      [limit],
    );
    return res.rows;
  }

  async claimsTodayCount(): Promise<number> {
    const res = await this.db.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM daily_reward_claims
        WHERE reward_date = (now() AT TIME ZONE '${REWARD_TIMEZONE}')::date`,
    );
    return Number(res.rows[0]?.n ?? 0);
  }
}
