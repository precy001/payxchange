import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [ReferralsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository], // other modules (transactions) will need these
})
export class UsersModule {}