import { IsString, IsUUID, Length } from 'class-validator';

export class InitiateTransactionDto {
  // The token scanned from the QR code.
  @IsString()
  @Length(10, 200)
  token!: string;

  // Which of the payer's saved cards to charge. The payer's identity itself
  // comes from the auth token, never the request body.
  @IsUUID()
  fundingSourceId!: string;
}