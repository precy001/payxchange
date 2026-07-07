import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PayoutDestinationsService } from './payout-destinations.service';

class AddDestinationDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'bankCode must be digits' })
  bankCode!: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'accountNumber must be 10 digits' })
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  accountName?: string;
}

@Controller('payout-destinations')
export class PayoutDestinationsController {
  constructor(private readonly service: PayoutDestinationsService) {}

  // GET /payout-destinations/banks — banks + provider codes for the picker.
  @Get('banks')
  banks() {
    return this.service.listBanks();
  }

  // GET /payout-destinations/resolve?accountNumber=&bankCode= — name preview.
  @Get('resolve')
  resolve(@Query('accountNumber') accountNumber: string, @Query('bankCode') bankCode: string) {
    return this.service.resolve(accountNumber, bankCode);
  }

  // GET /payout-destinations/me — the user's saved payout accounts.
  @Get('me')
  list(@CurrentUser() userId: string) {
    return this.service.list(userId);
  }

  // POST /payout-destinations — add a payout account.
  @Post()
  add(@CurrentUser() userId: string, @Body() dto: AddDestinationDto) {
    return this.service.add(userId, dto);
  }

  // POST /payout-destinations/:id/default — make it the default.
  @Post(':id/default')
  makeDefault(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.makeDefault(userId, id);
  }

  // DELETE /payout-destinations/:id — remove one.
  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
