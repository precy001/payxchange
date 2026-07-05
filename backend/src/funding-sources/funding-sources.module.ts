import { Module } from '@nestjs/common';
import { FundingSourcesController } from './funding-sources.controller';
import { FundingSourcesService } from './funding-sources.service';
import { FundingSourcesRepository } from './funding-sources.repository';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule], // PAYMENT_PROVIDER (to know which cards are usable)
  controllers: [FundingSourcesController],
  providers: [FundingSourcesService, FundingSourcesRepository],
  exports: [FundingSourcesService, FundingSourcesRepository],
})
export class FundingSourcesModule {}