import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

// For now this creates a MOCK card on file so we can build and test the charge
// flow. In Stage 2 we replace this with real Nomba card tokenization, where the
// token comes back from Nomba after the payer enters a card once — and we still
// never store the actual card number.

export class CreateFundingSourceDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  brand?: string; // e.g. 'visa', 'verve'

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'last4 must be exactly 4 digits' })
  last4?: string;
}