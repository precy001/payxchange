import { Body, Controller, Post } from '@nestjs/common';
import { RegisterTokenDto } from './dto/register-token.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

// Authed (not @Public): the global JWT guard requires a valid token.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // POST /notifications/token — the app registers its Expo push token here.
  @Post('token')
  register(@CurrentUser() userId: string, @Body() dto: RegisterTokenDto) {
    return this.notifications.registerToken(userId, dto.token, dto.platform);
  }
}
