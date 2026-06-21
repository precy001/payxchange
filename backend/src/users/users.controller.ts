import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // GET /users/me — the current user's own profile. Registration now happens
  // through /auth/register, so there's no open user-creation endpoint.
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.users.getById(userId);
  }
}