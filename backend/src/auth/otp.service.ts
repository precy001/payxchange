import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../infra/redis.module';

// One-time-password handling. The code is never stored in plaintext — only a
// salted hash sits in Redis, with a short TTL and a hard cap on guess attempts.
// Sending is MOCKED for now (printed to the server log); swapping in a real SMS
// provider is a one-line change in `deliver()`.

const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

export type VerifyResult = 'ok' | 'expired' | 'too_many' | 'mismatch';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(phone: string): string {
    return `otp:${phone}`;
  }

  private hash(phone: string, code: string): string {
    // Salt with the phone so the same code for two numbers hashes differently.
    return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  async sendCode(phone: string): Promise<void> {
    // crypto.randomInt is unbiased — better than Math.random for security codes.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const payload = JSON.stringify({ hash: this.hash(phone, code), attempts: 0 });
    await this.redis.set(this.key(phone), payload, 'EX', OTP_TTL_SECONDS);
    await this.deliver(phone, code);
  }

  // MOCK delivery. Replace the body with a real SMS provider call later;
  // nothing else in the app changes.
  private async deliver(phone: string, code: string): Promise<void> {
    this.logger.log(`[MOCK SMS] OTP for ${phone} is ${code} (valid 5 minutes)`);
  }

  async verifyCode(phone: string, code: string): Promise<VerifyResult> {
    const raw = await this.redis.get(this.key(phone));
    if (!raw) return 'expired';

    const data = JSON.parse(raw) as { hash: string; attempts: number };
    if (data.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(this.key(phone));
      return 'too_many';
    }

    const expected = Buffer.from(data.hash);
    const got = Buffer.from(this.hash(phone, code));
    const match =
      expected.length === got.length && crypto.timingSafeEqual(expected, got);

    if (match) {
      await this.redis.del(this.key(phone)); // single-use
      return 'ok';
    }

    // Wrong guess: increment attempts, preserving the remaining TTL.
    data.attempts += 1;
    const ttl = await this.redis.ttl(this.key(phone));
    await this.redis.set(
      this.key(phone),
      JSON.stringify(data),
      'EX',
      ttl > 0 ? ttl : OTP_TTL_SECONDS,
    );
    return 'mismatch';
  }
}
