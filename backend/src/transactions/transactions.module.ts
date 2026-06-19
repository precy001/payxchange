import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { PaymentsModule } from '../payments/payments.module';
import { FundingSourcesModule } from '../funding-sources/funding-sources.module';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PaymentsModule, // PAYMENT_PROVIDER
    FundingSourcesModule, // FundingSourcesRepository
    PaymentRequestsModule, // PaymentRequestsRepository
    UsersModule, // UsersRepository
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsService, TransactionsRepository],
})
export class TransactionsModule {}
