import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto, UpdateDisputeStatusDto } from './dto/dispute.dto';

@Controller('disputes')
export class DisputesController {
  constructor(
    private readonly disputes: DisputesService,
    private readonly config: ConfigService,
  ) {}

  // POST /disputes — report a problem with a transaction.
  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(userId, dto);
  }

  // GET /disputes — list my reports.
  @Get()
  list(@CurrentUser() userId: string) {
    return this.disputes.listMine(userId);
  }

  // GET /disputes/transaction/:txnId — my report for a given transaction (or null).
  @Get('transaction/:txnId')
  forTransaction(@CurrentUser() userId: string, @Param('txnId') txnId: string) {
    return this.disputes.getForTransaction(userId, txnId);
  }

  // POST /disputes/:id/status — move a report through its lifecycle.
  // No admin panel yet, so this mirrors the webhook simulator: dev-only, for
  // testing the resolution flow via Thunder Client.
  @Public()
  @Post(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateDisputeStatusDto) {
    const env = this.config.get('nodeEnv');
    if (env === 'production') {
      throw new ForbiddenException('Status endpoint is disabled in production');
    }
    const updated = await this.disputes.updateStatus(id, dto.status, dto.resolution);
    if (!updated) throw new NotFoundException('Dispute not found');
    return updated;
  }
}
