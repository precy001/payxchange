import { IsString, Matches, MaxLength } from 'class-validator';

const PIN = /^\d{4}$/;

export class ChangePinDto {
  @IsString()
  @Matches(PIN, { message: 'currentPin must be 4 digits' })
  currentPin!: string;

  @IsString()
  @Matches(PIN, { message: 'newPin must be 4 digits' })
  newPin!: string;
}

export class AvatarDto {
  // A data URL (data:image/jpeg;base64,...). Capped to keep payloads small —
  // the app resizes to a thumbnail before sending.
  @IsString()
  @MaxLength(800_000, { message: 'image is too large' })
  avatar!: string;
}

export class DeleteAccountDto {
  @IsString()
  @Matches(PIN, { message: 'pin must be 4 digits' })
  pin!: string;
}