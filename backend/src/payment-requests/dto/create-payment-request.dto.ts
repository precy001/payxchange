import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreatePaymentRequestDto {
  // 'merchant' = supermarket-style checkout, 'p2p' = person to person.
  @IsIn(['p2p', 'merchant'])
  type!: 'p2p' | 'merchant';

  // Integer KOBO. 500000 means 5,000 naira. We never use decimals for money.
  // Upper bound is a sanity cap against typos/overflow (₦10,000,000 here).
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountKobo!: number;

  @IsString()
  @Length(1, 200)
  description!: string;
}