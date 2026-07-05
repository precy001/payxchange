import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { ConfirmTransactionDto } from './dto/confirm-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  // POST /transactions/initiate — payer (from token) scans a QR.
  @Post('initiate')
  initiate(@CurrentUser() userId: string, @Body() dto: InitiateTransactionDto) {
    return this.service.initiate({
      token: dto.token,
      payerUserId: userId,
      fundingSourceId: dto.fundingSourceId,
    });
  }

  // POST /transactions/:id/confirm — payer re-authorizes with their PIN.
  @Post(':id/confirm')
  confirm(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTransactionDto,
  ) {
    return this.service.confirm(id, userId, dto.pin);
  }

  // GET /transactions — the current user's transaction history (feed).
  @Get()
  list(@CurrentUser() userId: string) {
    return this.service.listForUser(userId);
  }

  // GET /transactions/summary?month=YYYY-MM — monthly in/out totals + series.
  @Get('summary')
  summary(@CurrentUser() userId: string, @Query('month') month?: string) {
    return this.service.monthlySummary(userId, month);
  }

  // GET /transactions/:id — only the payer or payee may view it.
  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id, userId);
  }

  // POST /transactions/:id/verify — actively confirm a hosted-checkout payment
  // with the provider (webhook-independent), charging if it went through.
  @Post(':id/verify')
  verify(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.verifyAndCharge(id, userId);
  }
}