import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // POST /users  — register a new user.
  @Post()
  register(@Body() dto: RegisterUserDto) {
    return this.users.register(dto);
  }

  // GET /users/:id — ParseUUIDPipe rejects a malformed id with a 400 before
  // we hit the database.
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }
}
