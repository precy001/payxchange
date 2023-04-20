import { BadRequestException, Injectable } from '@nestjs/common';
import { DailyRewardsRepository } from './daily-rewards.repository';
import {
  DAILY_REWARD_NAIRA,
  DAILY_REWARD_THRESHOLD,
  DAILY_REWARD_WHATSAPP,
  PER_COUNTERPARTY_DAILY_CAP,
} from './daily-rewards.constants';

@Injectable()
export class DailyRewardsService {
  constructor(private readonly repo: DailyRewardsRepository) {}

  async summary(userId: string) {
    const [counted, claimedAt] = await Promise.all([
      this.repo.countedToday(userId),
      this.repo.claimedToday(userId),
    ]);
    return {
      countedToday: counted,
      threshold: DAILY_REWARD_THRESHOLD,
      perCounterpartyCap: PER_COUNTERPARTY_DAILY_CAP,
      rewardNaira: DAILY_REWARD_NAIRA,
      eligible: counted >= DAILY_REWARD_THRESHOLD && !claimedAt,
      claimedToday: !!claimedAt,
      whatsapp: DAILY_REWARD_WHATSAPP,
    };
  }

  async claim(userId: string) {
    const counted = await this.repo.countedToday(userId);
    if (counted < DAILY_REWARD_THRESHOLD) {
      throw new BadRequestException(`You need ${DAILY_REWARD_THRESHOLD} counted transactions today to claim`);
    }
    const claimed = await this.repo.tryClaim(userId);
    if (!claimed) {
      // Either already claimed today, or a concurrent request just claimed it.
      throw new BadRequestException("You've already claimed today's reward");
    }
    return {
      message: 'Reward unlocked',
      rewardNaira: DAILY_REWARD_NAIRA,
      whatsapp: DAILY_REWARD_WHATSAPP,
    };
  }
}
