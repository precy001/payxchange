import { IsOptional, IsString, Length, Matches } from 'class-validator';

// Creates a MOCK card on file for now. The owner comes from the auth token,
// never the body. Real Nomba tokenization replaces this later.
export class CreateFundingSourceDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  brand?: string; // e.g. 'visa', 'verve'

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'last4 must be exactly 4 digits' })
  last4?: string;
}