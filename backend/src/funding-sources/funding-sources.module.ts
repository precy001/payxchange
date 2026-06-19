import { Module } from '@nestjs/common';
import { FundingSourcesController } from './funding-sources.controller';
import { FundingSourcesService } from './funding-sources.service';
import { FundingSourcesRepository } from './funding-sources.repository';

@Module({
  controllers: [FundingSourcesController],
  providers: [FundingSourcesService, FundingSourcesRepository],
  exports: [FundingSourcesService, FundingSourcesRepository],
})
export class FundingSourcesModule {}
