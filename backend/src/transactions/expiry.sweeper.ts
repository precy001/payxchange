import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../infra/database.module';
import { TransactionsRepository } from './transactions.repository';

// Sweeps up transactions a payer scanned but never confirmed. Without this they
// sit in 'pending' forever. We move them to 'failed' once they're older than the
// cutoff (a little past the QR's 10-minute life). Default 15 minutes; override
// with PENDING_EXPIRY_MINUTES (handy for testing — set it to 1).

const SWEEP_MS = 60_000;
const DEFAULT_MINUTES = 15;

@Injectable()
export class ExpirySweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirySweeper.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly txns: TransactionsRepository,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.tick(), SWEEP_MS);
    this.logger.log(`Expiry sweeper started (every ${SWEEP_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private minutes(): number {
    const v = Number(process.env.PENDING_EXPIRY_MINUTES);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_MINUTES;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const stale = await this.txns.findStaleUnconfirmed(this.minutes());
      let expired = 0;
      for (const t of stale) {
        try {
          const moved = await this.db.withTransaction((c) =>
            this.txns.transition(c, t.id, t.state, 'failed', t.version),
          );
          if (moved) expired += 1;
        } catch (err) {
          this.logger.error(`Failed to expire ${t.id}: ${String(err)}`);
        }
      }
      if (expired > 0) this.logger.log(`Expired ${expired} stale transaction(s)`);
    } catch (err) {
      this.logger.error(`Sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}