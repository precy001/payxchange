import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { PaymentRequestsService } from './payment-requests.service';

@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(private readonly service: PaymentRequestsService) {}

  // POST /payment-requests — payee creates a request, gets back a QR.
  @Post()
  create(@Body() dto: CreatePaymentRequestDto) {
    return this.service.create(dto);
  }

  // GET /payment-requests/resolve/:token — payer's app reads a scanned code.
  @Get('resolve/:token')
  resolve(@Param('token') token: string) {
    return this.service.resolve(token);
  }
}
