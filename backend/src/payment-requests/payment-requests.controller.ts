import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { PaymentRequestsService } from './payment-requests.service';

@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(private readonly service: PaymentRequestsService) {}

  // POST /payment-requests — the payee (from token) creates a request + QR.
  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreatePaymentRequestDto) {
    return this.service.create(userId, dto);
  }

  // GET /payment-requests/resolve/:token — payer previews a scanned code.
  @Get('resolve/:token')
  resolve(@Param('token') token: string) {
    return this.service.resolve(token);
  }
}