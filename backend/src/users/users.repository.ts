import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  full_name: string | null;
  kyc: string;
  phone_verified: boolean;
  avatar: string | null;
  deactivated_at: string | null;
  frozen_at: string | null;
  created_at: string;
}

const COLS = `id, phone, email, full_name, kyc, phone_verified, avatar, deactivated_at, frozen_at, created_at`;

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async createWithAudit(input: {
    phone: string;
    email?: string;
    fullName?: string;
  }): Promise<UserRow> {
    return this.db.withTransaction(async (client) => {
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (phone, email, full_name)
         VALUES ($1, $2, $3)
         RETURNING ${COLS}`,
        [input.phone, input.email ?? null, input.fullName ?? null],
      );
      const user = inserted.rows[0];

      await client.query(
        `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'user.registered', 'user', user.id, JSON.stringify({ phone: input.phone })],
      );

      return user;
    });
  }

  async findById(id: string): Promise<UserRow | null> {
    const res = await this.db.query<UserRow>(
      `SELECT ${COLS} FROM users WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async findByPhone(phone: string): Promise<UserRow | null> {
    const res = await this.db.query<UserRow>(
      `SELECT ${COLS} FROM users WHERE phone = $1`,
      [phone],
    );
    return res.rows[0] ?? null;
  }

  async markPhoneVerified(id: string): Promise<void> {
    await this.db.query(`UPDATE users SET phone_verified = true WHERE id = $1`, [id]);
  }

  async updateAvatar(id: string, avatar: string): Promise<void> {
    await this.db.query(`UPDATE users SET avatar = $2 WHERE id = $1`, [id, avatar]);
  }

  // Soft delete: keep the row (and its financial history) but mark it closed.
  async deactivate(id: string): Promise<void> {
    await this.db.query(`UPDATE users SET deactivated_at = now() WHERE id = $1`, [id]);
  }

  // Reversible freeze. Pass true to freeze, false to unfreeze.
  async setFrozen(id: string, frozen: boolean): Promise<void> {
    await this.db.query(
      `UPDATE users SET frozen_at = ${frozen ? 'now()' : 'NULL'} WHERE id = $1`,
      [id],
    );
  }
}