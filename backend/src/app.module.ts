import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { loadConfig } from './config/configuration';
import { RedisModule } from './infra/redis.module';
import { DatabaseModule } from './infra/database.module';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { FundingSourcesModule } from './funding-sources/funding-sources.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuthModule } from './auth/auth.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig], // validates required env vars at boot (fail fast)
    }),
    // Global rate limit: 100 requests per minute per IP. Throttles abuse and
    // brute force. Sensitive endpoints (login, PIN) will get stricter limits
    // when auth is added.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    RedisModule,
    DatabaseModule,
    PaymentsModule,
    UsersModule,
    PaymentRequestsModule,
    FundingSourcesModule,
    TransactionsModule,
    AuthModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}