import { Body, Controller, Delete, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentSession, CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { SessionsRepository } from './sessions.repository';
import { AvatarDto, ChangePinDto, DeleteAccountDto, FreezeDto } from './dto/account.dto';

// Account management for the logged-in user. NOT @Public, so the global guard
// requires a valid token on every route here.
@Controller('account')
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly usersRepo: UsersRepository,
    private readonly sessions: SessionsRepository,
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

  // POST /account/freeze — stop the account from moving money. PIN required.
  @Post('freeze')
  async freeze(@CurrentUser() userId: string, @Body() dto: FreezeDto) {
    await this.auth.verifyPinOrThrow(userId, dto.pin);
    await this.usersRepo.setFrozen(userId, true);
    return { message: 'Account frozen', frozen: true };
  }

  // POST /account/unfreeze — re-enable the account. PIN required.
  @Post('unfreeze')
  async unfreeze(@CurrentUser() userId: string, @Body() dto: FreezeDto) {
    await this.auth.verifyPinOrThrow(userId, dto.pin);
    await this.usersRepo.setFrozen(userId, false);
    return { message: 'Account unfrozen', frozen: false };
  }

  // GET /account/sessions — list active devices/sessions.
  @Get('sessions')
  async listSessions(@CurrentUser() userId: string, @CurrentSession() current?: string) {
    const rows = await this.sessions.listActive(userId);
    return rows.map((s) => ({
      id: s.id,
      label: s.label,
      platform: s.platform,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      current: s.id === current,
    }));
  }

  // DELETE /account/sessions/:id — sign out one device.
  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() userId: string, @Param('id') id: string) {
    const ok = await this.sessions.revoke(userId, id);
    if (!ok) throw new NotFoundException('Session not found');
    return { message: 'Device signed out' };
  }

  // POST /account/sessions/logout-others — sign out every other device.
  @Post('sessions/logout-others')
  async logoutOthers(@CurrentUser() userId: string, @CurrentSession() current?: string) {
    const count = await this.sessions.revokeOthers(userId, current ?? '');
    return { message: 'Other devices signed out', count };
  }
}