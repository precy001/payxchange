import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  full_name: string | null;
  kyc: string;
  created_at: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  // Create the user AND an audit row atomically. If either insert fails, the
  // transaction rolls back and neither row exists — no orphaned audit entries,
  // no user without a trail. This is the withTransaction pattern in miniature.
  async createWithAudit(input: {
    phone: string;
    email?: string;
    fullName?: string;
  }): Promise<UserRow> {
    return this.db.withTransaction(async (client) => {
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (phone, email, full_name)
         VALUES ($1, $2, $3)
         RETURNING id, phone, email, full_name, kyc, created_at`,
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
      `SELECT id, phone, email, full_name, kyc, created_at
         FROM users WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }
}
