import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

// The single gateway to Postgres for the whole app. Two things matter here:
//
// 1. withTransaction() — the backbone of every money operation. The callback
//    runs inside BEGIN/COMMIT; any thrown error triggers ROLLBACK. This is how
//    we guarantee a charge + its ledger rows + its outbox event all land
//    together or not at all. NEVER write money rows outside this.
//
// 2. Inside a transaction you get a single dedicated client, so you can take
//    row locks (SELECT ... FOR UPDATE) and optimistic-lock with the version
//    column — neither is safe across separate pool connections.

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const url = config.get<string>('databaseUrl')!;
    // Neon (and most managed Postgres) require TLS. node-postgres needs the
    // ssl option set explicitly even when the URL says sslmode=require.
    const needsSsl = /sslmode=require/.test(url) || /neon\.tech/.test(url);
    // Verify the server's certificate by default (prevents man-in-the-middle).
    // Only relax this if your provider needs a custom CA and you can't supply
    // one yet — set DATABASE_SSL_REJECT_UNAUTHORIZED=false. Neon's certs are
    // publicly trusted, so verification should "just work".
    const rejectUnauthorized =
      (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? 'true') !== 'false';
    this.pool = new Pool({
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized } : undefined,
      max: 10, // pool size; tune per deployment
    });
  }

  // One-off query on a pooled connection. Use for simple reads/writes that
  // don't need a transaction.
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pool.query<T>(text, params as any[]);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  }

  // Run a unit of work atomically. Everything inside fn uses the SAME client.
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('Postgres pool closed');
  }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}