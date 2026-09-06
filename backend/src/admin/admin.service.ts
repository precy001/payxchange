import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { DatabaseService } from '../infra/database.module';

// Constant-time string compare so login can't be timed to guess the password.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async login(username: string, password: string) {
    const U = process.env.ADMIN_USERNAME;
    const P = process.env.ADMIN_PASSWORD;
    if (!U || !P) {
      // Misconfiguration — fail closed rather than allow a blank login.
      throw new UnauthorizedException('Admin login is not configured');
    }
    if (!safeEqual(username ?? '', U) || !safeEqual(password ?? '', P)) {
      throw new UnauthorizedException('Incorrect username or password');
    }
    const token = await this.jwt.signAsync({ sub: username, typ: 'admin' }, { expiresIn: '8h' });
    return { token };
  }

  // ---- read-only dashboard data ----

  async stats() {
    const q = async (sql: string) => Number((await this.db.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
    const [users, txns, completed, referralsQualified, disputesOpen, rewardsClaimed] = await Promise.all([
      q(`SELECT COUNT(*)::int n FROM users`),
      q(`SELECT COUNT(*)::int n FROM transactions`),
      q(`SELECT COUNT(*)::int n FROM transactions WHERE state = 'completed'`),
      q(`SELECT COUNT(*)::int n FROM referrals WHERE status = 'qualified'`),
      q(`SELECT COUNT(*)::int n FROM disputes WHERE status = 'open'`),
      q(`SELECT COUNT(*)::int n FROM users WHERE referral_reward_claimed_at IS NOT NULL`),
    ]);
    const volume = Number(
      (await this.db.query<{ v: string }>(
        `SELECT COALESCE(SUM(amount_kobo),0)::bigint v FROM transactions WHERE state = 'completed'`,
      )).rows[0]?.v ?? 0,
    );
    return { users, txns, completed, volumeKobo: volume, referralsQualified, disputesOpen, rewardsClaimed };
  }

  async users(limit = 100) {
    const res = await this.db.query(
      `SELECT id, phone, full_name, email, phone_verified, referral_code,
              referral_reward_claimed_at, frozen_at, created_at
         FROM users ORDER BY created_at DESC LIMIT $1`,
      [Math.min(limit, 500)],
    );
    return res.rows;
  }

  async transactions(limit = 100) {
    const res = await this.db.query(
      `SELECT t.id, t.state, t.amount_kobo, t.fee_kobo, t.created_at,
              payer.phone AS payer_phone, payee.phone AS payee_phone
         FROM transactions t
         JOIN users payer ON payer.id = t.payer_user_id
         JOIN users payee ON payee.id = t.payee_user_id
        ORDER BY t.created_at DESC LIMIT $1`,
      [Math.min(limit, 500)],
    );
    return res.rows;
  }

  // Referral verification view: per referrer — code, signed-up, qualified, and
  // whether they've hit the threshold / already claimed. This is what an admin
  // uses to verify a claim before paying out.
  async referrals() {
    const res = await this.db.query(
      `SELECT u.id,
              u.phone,
              u.full_name,
              u.referral_code,
              u.referral_reward_claimed_at,
              COUNT(r.*)::int                                      AS signed_up,
              COUNT(r.*) FILTER (WHERE r.status = 'qualified')::int AS qualified
         FROM users u
         LEFT JOIN referrals r ON r.referrer_user_id = u.id
        GROUP BY u.id
        HAVING COUNT(r.*) > 0
        ORDER BY qualified DESC, signed_up DESC`,
    );
    return res.rows;
  }

  async disputes(limit = 100) {
    const res = await this.db.query(
      `SELECT d.id, d.status, d.reason, d.details, d.created_at,
              u.phone AS user_phone, d.transaction_id
         FROM disputes d
         JOIN users u ON u.id = d.user_id
        ORDER BY d.created_at DESC LIMIT $1`,
      [Math.min(limit, 500)],
    );
    return res.rows;
  }
}
