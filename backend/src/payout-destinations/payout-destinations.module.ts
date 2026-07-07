import { Module } from '@nestjs/common';
import { PayoutDestinationsController } from './payout-destinations.controller';
import { PayoutDestinationsService } from './payout-destinations.service';
import { PayoutDestinationsRepository } from './payout-destinations.repository';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule], // PAYMENT_PROVIDER (bank list + resolve)
  controllers: [PayoutDestinationsController],
  providers: [PayoutDestinationsService, PayoutDestinationsRepository],
  exports: [PayoutDestinationsRepository], // payout + payment-requests read the default
})
export class PayoutDestinationsModule {}
