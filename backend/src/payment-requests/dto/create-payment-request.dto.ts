import { IsIn, IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreatePaymentRequestDto {
  // Who is being paid. For now the client sends this; once we add auth it will
  // come from the logged-in user instead, and this field goes away.
  @IsUUID()
  payeeUserId!: string;

  // 'merchant' = supermarket-style checkout, 'p2p' = person to person.
  @IsIn(['p2p', 'merchant'])
  type!: 'p2p' | 'merchant';

  // Integer KOBO. 500000 means 5,000 naira. We never use decimals for money.
  @IsInt()
  @Min(1)
  amountKobo!: number;

  @IsString()
  @Length(1, 200)
  description!: string;
}