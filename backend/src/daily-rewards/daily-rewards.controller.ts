import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { DailyRewardsService } from './daily-rewards.service';

@Controller('rewards/daily')
export class DailyRewardsController {
  constructor(private readonly service: DailyRewardsService) {}

  // GET /rewards/daily/me — today's counted transactions, eligibility, contact.
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.service.summary(userId);
  }

  // POST /rewards/daily/claim — claim today's reward (once eligible).
  @Post('claim')
  claim(@CurrentUser() userId: string) {
    return this.service.claim(userId);
  }
}
