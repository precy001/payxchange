import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async registerToken(userId: string, token: string, platform?: string) {
    await this.repo.upsertToken(userId, token, platform);
    return { message: 'Token registered' };
  }

  // Send a push to every device a user has registered. Best-effort: failures are
  // logged, and tokens the push service reports as dead are pruned.
  async notifyUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const tokens = await this.repo.getTokensForUser(userId);
    if (tokens.length === 0) return;

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: data ?? {},
      priority: 'high',
      channelId: 'default',
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json: any = await res.json();
      const tickets = json?.data;
      if (Array.isArray(tickets)) {
        tickets.forEach((t: any, i: number) => {
          if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') {
            this.repo.deleteToken(tokens[i]).catch(() => {});
          }
        });
      }
    } catch (err) {
      this.logger.error(`Push send failed: ${String(err)}`);
    }
  }
}
