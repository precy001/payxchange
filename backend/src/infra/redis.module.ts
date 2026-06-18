import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// A single shared Redis connection, injectable anywhere as REDIS.
// Used for: the Nomba token cache + lock, single-use QR tokens (TTL),
// idempotency keys, rate limiting, and distributed locks.
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redisUrl');
        return new Redis(url as string, { maxRetriesPerRequest: null });
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}