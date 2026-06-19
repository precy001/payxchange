import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateFundingSourceDto } from './dto/create-funding-source.dto';
import { FundingSourcesService } from './funding-sources.service';

@Controller('funding-sources')
export class FundingSourcesController {
  constructor(private readonly service: FundingSourcesService) {}

  // POST /funding-sources — add a (mock) card for a user.
  @Post()
  create(@Body() dto: CreateFundingSourceDto) {
    return this.service.create(dto);
  }

  // GET /funding-sources/user/:userId — list a user's cards.
  @Get('user/:userId')
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.listByUser(userId);
  }
}
