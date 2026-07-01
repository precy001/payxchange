import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { DisputesRepository } from './disputes.repository';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule], // TransactionsService (ownership check)
  controllers: [DisputesController],
  providers: [DisputesService, DisputesRepository],
})
export class DisputesModule {}
