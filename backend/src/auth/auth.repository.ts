import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

export interface CredentialsRow {
  user_id: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly db: DatabaseService) {}

  // Create or replace the PIN. Setting a (new) PIN clears any prior lockout.
  async upsertPin(userId: string, pinHash: string): Promise<void> {
    await this.db.query(
      `INSERT INTO user_credentials (user_id, pin_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET pin_hash = EXCLUDED.pin_hash,
                     failed_attempts = 0,
                     locked_until = NULL,
                     updated_at = now()`,
      [userId, pinHash],
    );
  }

  async getCredentials(userId: string): Promise<CredentialsRow | null> {
    const res = await this.db.query<CredentialsRow>(
      `SELECT user_id, pin_hash, failed_attempts, locked_until
         FROM user_credentials WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] ?? null;
  }

  async recordFailedAttempt(
    userId: string,
    attempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE user_credentials
          SET failed_attempts = $2, locked_until = $3, updated_at = now()
        WHERE user_id = $1`,
      [userId, attempts, lockedUntil],
    );
  }

  async resetAttempts(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE user_credentials
          SET failed_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE user_id = $1`,
      [userId],
    );
  }
}