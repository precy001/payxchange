import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import { normalizePhone } from '../../common/phone';

// These decorators are enforced automatically by the global ValidationPipe.
// A request that violates any rule is rejected with a 400 before it ever
// reaches our code — so the service can trust its input.

export class RegisterUserDto {
  // E.164-style phone, e.g. +2348012345678. This is the primary identity.
  // Normalised first, so 09162542339 / 9162542339 / +2349162542339 all match.
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
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