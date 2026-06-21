import { IsString, Matches } from 'class-validator';

export class ConfirmTransactionDto {
  // The payer re-authorizes THIS payment with their PIN (or biometric on
  // device, which supplies it). Being logged in is not enough to move money.
  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin!: string;
}
