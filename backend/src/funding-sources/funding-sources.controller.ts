import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
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

  // GET /funding-sources/me — list the current user's usable cards.
  @Get('me')
  listMine(@CurrentUser() userId: string) {
    return this.service.listByUser(userId);
  }

  // DELETE /funding-sources/:id — remove a saved card.
  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}