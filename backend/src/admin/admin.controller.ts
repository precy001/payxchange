import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class AdminLoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
}

// All routes are @Public so the global USER auth guard doesn't run — admins
// aren't app users. Data routes are instead protected by AdminGuard.
@Public()
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.service.login(dto.username, dto.password);
  }

  @UseGuards(AdminGuard)
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @UseGuards(AdminGuard)
  @Get('users')
  users(@Query('limit') limit?: string) {
    return this.service.users(limit ? Number(limit) : 100);
  }

  @UseGuards(AdminGuard)
  @Get('transactions')
  transactions(@Query('limit') limit?: string) {
    return this.service.transactions(limit ? Number(limit) : 100);
  }

  @UseGuards(AdminGuard)
  @Get('referrals')
  referrals() {
    return this.service.referrals();
  }

  @UseGuards(AdminGuard)
  @Get('disputes')
  disputes(@Query('limit') limit?: string) {
    return this.service.disputes(limit ? Number(limit) : 100);
  }
}
