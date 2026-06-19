import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  // POST /transactions/initiate — payer scans a QR, a PENDING txn is created.
  @Post('initiate')
  initiate(@Body() dto: InitiateTransactionDto) {
    return this.service.initiate(dto);
  }

  // POST /transactions/:id/confirm — payer approves; we charge the card.
  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(id);
  }

  // GET /transactions/:id — inspect a transaction's current state.
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }
}
