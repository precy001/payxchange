import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadConfig } from './config/configuration';
import { RedisModule } from './infra/redis.module';
import { DatabaseModule } from './infra/database.module';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { FundingSourcesModule } from './funding-sources/funding-sources.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig], // validates required env vars at boot (fail fast)
    }),
    RedisModule,
    DatabaseModule,
    PaymentsModule,
    UsersModule,
    PaymentRequestsModule,
    FundingSourcesModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}