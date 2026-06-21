import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AccountController } from './account.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { AuthRepository } from './auth.repository';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<{ secret: string }>('jwt')!.secret,
      }),
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [AuthService, OtpService, TokenService, AuthRepository],
  exports: [AuthService, OtpService, TokenService, JwtModule],
})
export class AuthModule {}