import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

const PHONE = /^\+?[1-9]\d{7,14}$/;
const PIN = /^\d{4}$/;

export class RegisterDto {
  @IsString()
  @Matches(PHONE, {
    message: 'phone must be a valid international number, e.g. +2348012345678',
  })
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(PHONE)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class SetPinDto {
  // Issued by verify-otp; authorizes setting the PIN exactly once.
  @IsString()
  setupToken!: string;

  @IsString()
  @Matches(PIN, { message: 'PIN must be exactly 4 digits' })
  pin!: string;
}

export class LoginDto {
  @IsString()
  @Matches(PHONE)
  phone!: string;

  @IsString()
  @Matches(PIN, { message: 'PIN must be exactly 4 digits' })
  pin!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}