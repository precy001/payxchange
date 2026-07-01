import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService, DeviceCtx } from './auth.service';
import { Public } from './public.decorator';
import {
  LoginDto,
  RefreshDto,
  RegisterDto,
  SetPinDto,
  VerifyOtpDto,
} from './dto/auth.dto';

function deviceCtx(id?: string, name?: string, platform?: string): DeviceCtx {
  return {
    deviceId: id || null,
    label: name || null,
    platform: platform || null,
  };
}

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
  setPin(
    @Body() dto: SetPinDto,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-name') deviceName?: string,
    @Headers('x-device-platform') platform?: string,
  ) {
    return this.auth.setPin(dto, deviceCtx(deviceId, deviceName, platform));
  }

  // POST /auth/login — phone + PIN -> access + refresh tokens.
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-name') deviceName?: string,
    @Headers('x-device-platform') platform?: string,
  ) {
    return this.auth.login(dto, deviceCtx(deviceId, deviceName, platform));
  }

  // POST /auth/refresh — exchange a refresh token for a new pair.
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }
}