import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../infra/redis.module';

// Token rules:
//  - Access token: short-lived (15 min) signed JWT. Carries the user id. Can't
//    be revoked individually, which is fine BECAUSE it expires fast.
//  - Refresh token: long-lived (30 days) opaque random string stored in Redis.
//    It IS revocable (we just delete the key) and ROTATES on every use — a used
//    refresh token is immediately invalidated and a fresh one issued, so a
//    stolen one is useless after the real user refreshes once.
//  - Setup token: a 10-minute JWT that authorizes ONLY setting a PIN, issued
//    right after OTP verification so a stranger can't set a PIN on a phone.

const ACCESS_TTL = '15m';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async issueAuthTokens(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: 'access' },
      { expiresIn: ACCESS_TTL },
    );
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    await this.redis.set(`refresh:${refreshToken}`, userId, 'EX', REFRESH_TTL_SECONDS);
    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  async issueSetupToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, scope: 'pin_setup' }, { expiresIn: '10m' });
  }

  async verifySetupToken(token: string): Promise<string> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Setup session expired — verify your phone again');
    }
    if (payload?.scope !== 'pin_setup' || !payload?.sub) {
      throw new UnauthorizedException('Invalid setup token');
    }
    return payload.sub;
  }

  // Rotation: getdel atomically reads and deletes, so a refresh token works
  // exactly once.
  async rotateRefresh(refreshToken: string) {
    const userId = await this.redis.getdel(`refresh:${refreshToken}`);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return this.issueAuthTokens(userId);
  }
}