import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksRepository } from './webhooks.repository';
import { PaymentsModule } from '../payments/payments.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    PaymentsModule, // PAYMENT_PROVIDER (signature verification)
    TransactionsModule, // PayoutService (saga resolution)
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksRepository],
})
export class WebhooksModule {}
