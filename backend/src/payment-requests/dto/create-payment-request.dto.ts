import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreatePaymentRequestDto {
  // 'merchant' = supermarket-style checkout, 'p2p' = person to person.
  @IsIn(['p2p', 'merchant'])
  type!: 'p2p' | 'merchant';

  // A STATIC code carries no amount and never expires or gets consumed — the
  // payer enters the amount when they scan it. Think a printed code on a counter.
  @IsOptional()
  @IsBoolean()
  isStatic?: boolean;

  // Integer KOBO. 500000 means 5,000 naira. We never use decimals for money.
  // Required for a dynamic code; omitted for a static one (payer chooses).
  // Upper bound is a sanity cap against typos/overflow (₦10,000,000 here).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountKobo?: number;

  // Optional: "what's it for?" shouldn't block someone from receiving money.
  @IsOptional()
  @IsString()
  @Length(1, 200)
  description?: string;
}