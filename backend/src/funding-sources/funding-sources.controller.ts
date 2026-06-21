import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateFundingSourceDto } from './dto/create-funding-source.dto';
import { FundingSourcesService } from './funding-sources.service';

@Controller('funding-sources')
export class FundingSourcesController {
  constructor(private readonly service: FundingSourcesService) {}

  // POST /funding-sources — add a (mock) card for the current user.
  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateFundingSourceDto) {
    return this.service.create(userId, dto);
  }

  // GET /funding-sources/me — list the current user's cards.
  @Get('me')
  listMine(@CurrentUser() userId: string) {
    return this.service.listByUser(userId);
  }
}