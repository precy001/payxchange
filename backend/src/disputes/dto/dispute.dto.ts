import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const DISPUTE_REASONS = [
  'unauthorized',
  'wrong_amount',
  'not_received',
  'duplicate',
  'other',
] as const;

export const DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'rejected'] as const;

export class CreateDisputeDto {
  @IsUUID()
  transactionId!: string;

  @IsIn(DISPUTE_REASONS as unknown as string[])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class UpdateDisputeStatusDto {
  @IsIn(DISPUTE_STATUSES as unknown as string[])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;
}
