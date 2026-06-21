import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly db: DatabaseService) {}

  // Insert the event only if its payload_hash hasn't been seen. The UNIQUE
  // constraint on payload_hash is our idempotency anchor — providers retry, so
  // duplicates must be acknowledged but processed at most once.
  // Returns the new row id, or null if this is a duplicate.
  async recordIfNew(
    provider: string,
    eventType: string,
    payloadHash: string,
    payload: unknown,
  ): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO webhook_events (provider, event_type, payload_hash, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (payload_hash) DO NOTHING
       RETURNING id`,
      [provider, eventType, payloadHash, JSON.stringify(payload)],
    );
    return res.rows[0]?.id ?? null;
  }

  async markProcessed(id: string): Promise<void> {
    await this.db.query(`UPDATE webhook_events SET processed_at = now() WHERE id = $1`, [id]);
  }
}
