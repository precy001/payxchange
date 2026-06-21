import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import {
  LoginDto,
  RefreshDto,
  RegisterDto,
  SetPinDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /auth/register — create the account, send an OTP.
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // POST /auth/verify-otp — confirm the code; returns a PIN-setup token.
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  // POST /auth/set-pin — set the PIN using the setup token; returns tokens.
  @Post('set-pin')
  setPin(@Body() dto: SetPinDto) {
    return this.auth.setPin(dto);
  }

  // POST /auth/login — phone + PIN -> access + refresh tokens.
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // POST /auth/refresh — exchange a refresh token for a new pair.
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }
}