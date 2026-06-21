import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { PayoutService } from './payout.service';
import { OutboxWorker } from './outbox.worker';
import { ExpirySweeper } from './expiry.sweeper';
import { PaymentsModule } from '../payments/payments.module';
import { FundingSourcesModule } from '../funding-sources/funding-sources.module';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PaymentsModule, // PAYMENT_PROVIDER
    FundingSourcesModule, // FundingSourcesRepository
    PaymentRequestsModule, // PaymentRequestsRepository
    UsersModule, // UsersRepository
    AuthModule, // AuthService (PIN verification)
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, PayoutService, OutboxWorker, ExpirySweeper],
  exports: [TransactionsService, TransactionsRepository, PayoutService],
})
export class TransactionsModule {}