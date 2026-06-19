import { Module } from '@nestjs/common';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsRepository } from './payment-requests.repository';

@Module({
  controllers: [PaymentRequestsController],
  providers: [PaymentRequestsService, PaymentRequestsRepository],
  exports: [PaymentRequestsService, PaymentRequestsRepository],
})
export class PaymentRequestsModule {}
