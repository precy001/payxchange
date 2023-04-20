import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module'; // re-exports JwtModule (shared secret)
import { DailyRewardsModule } from '../daily-rewards/daily-rewards.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule, DailyRewardsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}