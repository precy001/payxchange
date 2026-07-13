import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import { normalizePhone } from '../../common/phone';

const PHONE = /^\+?[1-9]\d{7,14}$/;
const PIN = /^\d{4}$/;

// Accepts 09162542339 / 9162542339 / 2349162542339 / +2349162542339 and stores
// the one canonical form, so the same person always resolves to one account.
const NormalizePhone = () => Transform(({ value }) => normalizePhone(value));

export class RegisterDto {
  @NormalizePhone()
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
  @NormalizePhone()
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
  @NormalizePhone()
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