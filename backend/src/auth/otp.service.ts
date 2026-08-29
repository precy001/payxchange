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

  async sendCode(phone: string): Promise<string> {
    // crypto.randomInt is unbiased — better than Math.random for security codes.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const payload = JSON.stringify({ hash: this.hash(phone, code), attempts: 0 });
    await this.redis.set(this.key(phone), payload, 'EX', OTP_TTL_SECONDS);
    await this.deliver(phone, code);
    return code;
  }

  // Delivers the OTP by SMS via Termii — but only when SMS_LIVE=true. Otherwise
  // it just logs (free), so local/dev testing never spends SMS credits and the
  // beta dev-code path keeps working. Turn it on by setting SMS_LIVE=true plus
  // the Termii credentials in the environment.
  private async deliver(phone: string, code: string): Promise<void> {
    const message = `Your PayXchange verification code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`;

    const live = process.env.SMS_LIVE === 'true';
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID;
    const baseUrl = process.env.TERMII_BASE_URL ?? 'https://v3.api.termii.com';

    if (!live || !apiKey || !senderId) {
      // Not sending for real — log it (still readable in the server logs, and the
      // register response returns the code in non-production for beta testers).
      this.logger.log(`[SMS mock] OTP for ${phone} is ${code} (valid 5 minutes)`);
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone.replace(/^\+/, ''), // Termii wants digits, no leading +
          from: senderId,
          sms: message,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      // Termii returns { code: 'ok', message_id, ... } on success.
      if (!res.ok || (data?.code && data.code !== 'ok')) {
        this.logger.error(`[Termii] send failed for ${phone}: ${JSON.stringify(data)}`);
      } else {
        this.logger.log(`[Termii] OTP sent to ${phone} (message_id=${data?.message_id ?? 'n/a'})`);
      }
    } catch (err: any) {
      // Never let an SMS hiccup crash registration; the code is still valid and
      // (in beta) returned to the app.
      this.logger.error(`[Termii] send error for ${phone}: ${err?.message}`);
    }
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