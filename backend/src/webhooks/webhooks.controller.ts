import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Public } from '../auth/public.decorator';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  // The provider posts here. Public (the provider isn't logged in); authenticity
  // comes from the HMAC signature, not a session.
  @Public()
  @Post('nomba')
  async nomba(@Body() body: any, @Headers('x-nomba-signature') signature: string) {
    // NOTE: for byte-exact HMAC in production, capture the untouched raw request
    // body (a body-parser `verify` hook) and pass that here. On the mock
    // provider, verifyWebhookSignature returns true so re-serializing is fine.
    const rawBody = Buffer.from(JSON.stringify(body ?? {}));
    return this.webhooks.handle(rawBody, signature ?? '');
  }

  // Dev-only: pretend the provider called us, so the whole flow is testable on
  // the mock with no live Nomba and no public URL.
  @Public()
  @Post('simulate')
  async simulate(@Body() body: { transactionId: string; outcome: 'success' | 'failed' }) {
    const driver = this.config.get('paymentsDriver');
    const env = this.config.get('nodeEnv');
    if (driver !== 'mock' && env === 'production') {
      throw new ForbiddenException('Webhook simulator is disabled');
    }
    const payload = {
      event: body.outcome === 'success' ? 'payout.success' : 'payout.failed',
      data: { transactionId: body.transactionId, sessionId: `sim_${Date.now()}` },
    };
    // Unique hash per call so repeated simulations aren't deduped.
    const hash = createHash('sha256').update(JSON.stringify(payload) + Date.now()).digest('hex');
    return this.webhooks.process(payload, hash);
  }
}
