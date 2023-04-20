import { Module } from '@nestjs/common';
import { DailyRewardsController } from './daily-rewards.controller';
import { DailyRewardsService } from './daily-rewards.service';
import { DailyRewardsRepository } from './daily-rewards.repository';

@Module({
  controllers: [DailyRewardsController],
  providers: [DailyRewardsService, DailyRewardsRepository],
  exports: [DailyRewardsService, DailyRewardsRepository],
})
export class DailyRewardsModule {}
