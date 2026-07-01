import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.interface';
import { PayoutService } from '../transactions/payout.service';
import { TransactionsService } from '../transactions/transactions.service';
import { WebhooksRepository } from './webhooks.repository';

// Inbound provider callbacks. The provider tells us the async result of a
// payout or an inbound checkout payment; we verify it's authentic, dedupe it,
// and drive the flow.
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payout: PayoutService,
    private readonly transactions: TransactionsService,
    private readonly repo: WebhooksRepository,
  ) {}

  // Entry point for the real endpoint: verify HMAC over the raw body first.
  async handle(rawBody: Buffer, signature: string) {
    if (!this.provider.verifyWebhookSignature(rawBody, signature || '')) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Malformed webhook payload');
    }
    const hash = createHash('sha256').update(rawBody).digest('hex');
    return this.process(payload, hash);
  }

  // Core processing, shared by the real endpoint and the dev simulator.
  async process(payload: any, payloadHash: string) {
    const eventType: string = payload?.event ?? payload?.event_type ?? 'unknown';
    const data = payload?.data ?? {};

    // Dedupe: if we've already recorded this payload, do nothing.
    const id = await this.repo.recordIfNew(this.provider.name, eventType, payloadHash, payload);
    if (!id) {
      this.logger.log(`Duplicate webhook ignored (${eventType})`);
      return { duplicate: true };
    }

    // Inbound checkout success: Nomba echoes our orderReference back.
    if (eventType === 'payment_success') {
      const orderReference: string | undefined =
        data?.order?.orderReference ?? data?.orderReference;
      if (orderReference) {
        await this.transactions.chargeFromCheckout(orderReference);
        this.logger.log(`Checkout paid — order ${orderReference}`);
      } else {
        this.logger.warn('payment_success carried no orderReference');
      }
      await this.repo.markProcessed(id);
      return { ok: true, eventType, orderReference };
    }

    // Payout result events (our own payout.* / simulator).
    const transactionId: string | undefined = data.transactionId ?? this.parseTxnId(data.reference);
    if (transactionId) {
      if (eventType === 'payout.success') {
        await this.payout.confirmPayoutSuccess(transactionId, data.sessionId ?? null);
      } else if (eventType === 'payout.failed') {
        await this.payout.failPayout(transactionId);
      } else {
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
      }
    } else {
      this.logger.warn(`Webhook ${eventType} carried no resolvable transaction id`);
    }

    await this.repo.markProcessed(id);
    return { ok: true, eventType, transactionId };
  }

  // Our payout references look like `payout_<uuid>_<timestamp>`.
  private parseTxnId(reference?: string): string | undefined {
    if (!reference) return undefined;
    const m = /^payout_([0-9a-fA-F-]{36})_/.exec(reference);
    return m?.[1];
  }
}