import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class InitiateTransactionDto {
  // The token scanned from the QR code.
  @IsString()
  @Length(10, 200)
  token!: string;

  // Which of the payer's saved cards to charge. Optional: a first-time payer has
  // none, and we capture one via hosted checkout. The payer's identity itself
  // comes from the auth token, never the request body.
  @IsOptional()
  @IsUUID()
  fundingSourceId?: string;

  // Only for STATIC codes, where the payer chooses what to pay. Ignored for a
  // dynamic code (the amount is fixed by the payee and can't be overridden).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountKobo?: number;
}