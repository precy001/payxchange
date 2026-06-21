import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TransactionsRepository } from './transactions.repository';
import { PayoutService } from './payout.service';

// The publisher half of the transactional outbox. Every few seconds it reads
// unpublished events and dispatches them, then marks them published. A failed
// event stays unpublished and is retried on the next tick (slice 2 adds proper
// backoff). Single-process for now; for multiple instances we'd claim rows with
// SELECT ... FOR UPDATE SKIP LOCKED so two workers never grab the same event.

const POLL_MS = 3000;

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly txns: TransactionsRepository,
    private readonly payout: PayoutService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.logger.log(`Outbox worker started (every ${POLL_MS}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return; // never overlap ticks
    this.running = true;
    try {
      const events = await this.txns.fetchUnpublishedOutbox(20);
      for (const ev of events) {
        try {
          let done = true;
          if (ev.event_type === 'payout.requested') {
            done = await this.payout.runOne(ev.aggregate_id);
          }
          // Only retire the event once the saga reached a terminal state.
          if (done) await this.txns.markOutboxPublished(ev.id);
        } catch (err) {
          // Leave it unpublished; it'll be retried next tick.
          this.logger.error(`Outbox event ${ev.id} failed: ${String(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(`Outbox poll failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}