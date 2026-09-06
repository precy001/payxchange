import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PoolClient } from 'pg';
import { REFERRAL_WHATSAPP } from './referrals.constants';
import { REWARD_NAIRA, REWARD_THRESHOLD, ReferralsRepository } from './referrals.repository';

@Injectable()
export class ReferralsService {
  constructor(private readonly repo: ReferralsRepository) {}

  // A readable 6-char code, no ambiguous chars (0/O, 1/I).
  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  // Returns the user's code, generating (and saving) one on first request.
  async ensureCode(userId: string): Promise<string> {
    const existing = await this.repo.getCode(userId);
    if (existing) return existing;
    // Retry a few times in the unlikely event of a collision.
    for (let i = 0; i < 5; i++) {
      const code = this.generateCode();
      const taken = await this.repo.findUserIdByCode(code);
      if (!taken) {
        await this.repo.setCode(userId, code);
        return code;
      }
    }
    throw new BadRequestException('Could not generate a referral code, try again');
  }

  // Called during registration (inside its transaction) when a code was entered.
  async applyReferralCode(client: PoolClient, code: string, newUserId: string): Promise<void> {
    const referrerId = await this.repo.findUserIdByCode(code);
    if (!referrerId) return; // invalid code → silently ignore, don't block signup
    await this.repo.createReferral(client, referrerId, newUserId);
  }

  // Called when a user's transaction completes.
  async onTransactionCompleted(referredUserId: string): Promise<void> {
    await this.repo.markQualified(referredUserId);
  }

  async summary(userId: string) {
    const code = await this.ensureCode(userId);
    const { signedUp, qualified, claimedAt } = await this.repo.stats(userId);
    const eligible = qualified >= REWARD_THRESHOLD && !claimedAt;
    return {
      code,
      signedUp,
      qualified,
      threshold: REWARD_THRESHOLD,
      rewardNaira: REWARD_NAIRA,
      eligible,
      claimed: !!claimedAt,
      whatsapp: REFERRAL_WHATSAPP,
    };
  }

  // The user taps "Claim" — we mark it claimed and hand back the WhatsApp
  // contact. Actual payout is manual/off-app after admin verification.
  async claim(userId: string) {
    const { qualified, claimedAt } = await this.repo.stats(userId);
    if (claimedAt) throw new BadRequestException('Reward already claimed');
    if (qualified < REWARD_THRESHOLD) {
      throw new BadRequestException(`You need ${REWARD_THRESHOLD} qualified referrals to claim`);
    }
    await this.repo.markClaimed(userId);
    return {
      message: 'Reward unlocked',
      rewardNaira: REWARD_NAIRA,
      whatsapp: REFERRAL_WHATSAPP,
    };
  }
}
