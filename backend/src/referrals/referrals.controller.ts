import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  // GET /referrals/me — code, counts, eligibility, WhatsApp contact.
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.service.summary(userId);
  }

  // POST /referrals/claim — mark the one-time reward claimed, return contact.
  @Post('claim')
  claim(@CurrentUser() userId: string) {
    return this.service.claim(userId);
  }
}
