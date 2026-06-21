import { Body, Controller, Delete, Post } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { AvatarDto, ChangePinDto, DeleteAccountDto } from './dto/account.dto';

// Account management for the logged-in user. NOT @Public, so the global guard
// requires a valid token on every route here.
@Controller('account')
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly usersRepo: UsersRepository,
  ) {}

  // POST /account/change-pin
  @Post('change-pin')
  changePin(@CurrentUser() userId: string, @Body() dto: ChangePinDto) {
    return this.auth.changePin(userId, dto.currentPin, dto.newPin);
  }

  // POST /account/avatar — store the resized profile photo.
  @Post('avatar')
  async setAvatar(@CurrentUser() userId: string, @Body() dto: AvatarDto) {
    await this.usersRepo.updateAvatar(userId, dto.avatar);
    return { message: 'Photo updated' };
  }

  // DELETE /account — close the account (soft delete), PIN required.
  @Delete()
  async remove(@CurrentUser() userId: string, @Body() dto: DeleteAccountDto) {
    await this.auth.verifyPinOrThrow(userId, dto.pin);
    await this.usersRepo.deactivate(userId);
    return { message: 'Account closed' };
  }
}