import { IsString, IsUUID, Length } from 'class-validator';

export class InitiateTransactionDto {
  // The token scanned from the QR code.
  @IsString()
  @Length(10, 200)
  token!: string;

  // Who is paying (later this comes from the authenticated user).
  @IsUUID()
  payerUserId!: string;

  // Which of the payer's saved cards to charge.
  @IsUUID()
  fundingSourceId!: string;
}
