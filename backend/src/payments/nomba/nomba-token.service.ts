import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Redis from 'ioredis';
import { REDIS } from '../../infra/redis.module';

// Why this class exists, and why it's not trivial:
// Nomba keeps a SINGLE active session per credential. If multiple server
// instances each call /auth/token/issue, they invalidate each other and you
// get random 401s under load. Nomba's own docs say: let only one instance
// authenticate at a time, behind a lock.
//
// So we treat the token as SHARED STATE in Redis, and guard refreshes with a
// distributed lock. Any instance can read the cached token; only the lock
// holder may mint a new one. This is correct whether you run 1 box or 50.

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const TOKEN_KEY = 'nomba:token';
const LOCK_KEY = 'nomba:token:lock';
const LOCK_TTL_MS = 10_000; // lock auto-expires so a crashed holder can't deadlock
const REFRESH_SKEW_MS = 5 * 60_000; // refresh 5 min before the 30-min expiry

@Injectable()
export class NombaTokenService {
  private readonly logger = new Logger(NombaTokenService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // Public entry point. Returns a valid access token, refreshing if needed.
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.readCache();
      if (cached && cached.expiresAt - Date.now() > REFRESH_SKEW_MS) {
        return cached.accessToken;
      }
    }
    return this.refreshUnderLock(forceRefresh);
  }

  private async readCache(): Promise<CachedToken | null> {
    const raw = await this.redis.get(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as CachedToken) : null;
  }

  // Only the lock holder mints a token. Everyone else waits, then re-reads the
  // freshly cached token instead of authenticating themselves.
  private async refreshUnderLock(forceRefresh: boolean): Promise<string> {
    const lockId = `${process.pid}-${Date.now()}-${Math.random()}`;
    const gotLock = await this.redis.set(LOCK_KEY, lockId, 'PX', LOCK_TTL_MS, 'NX');

    if (!gotLock) {
      // Another instance is refreshing. Wait briefly and read what it produced.
      await this.sleep(300);
      const cached = await this.readCache();
      if (cached && cached.expiresAt - Date.now() > 0) return cached.accessToken;
      // Still nothing — retry the whole flow (bounded by the caller's usage).
      return this.getAccessToken(forceRefresh);
    }

    try {
      // Re-check inside the lock: another holder may have just refreshed.
      if (!forceRefresh) {
        const cached = await this.readCache();
        if (cached && cached.expiresAt - Date.now() > REFRESH_SKEW_MS) {
          return cached.accessToken;
        }
      }

      const existing = await this.readCache();
      const token =
        existing && !forceRefresh
          ? await this.exchangeRefreshToken(existing.refreshToken).catch(() => this.issueToken())
          : await this.issueToken();

      await this.redis.set(TOKEN_KEY, JSON.stringify(token));
      this.logger.log('Nomba access token refreshed');
      return token.accessToken;
    } finally {
      // Release the lock only if we still own it (avoid deleting someone else's).
      const current = await this.redis.get(LOCK_KEY);
      if (current === lockId) await this.redis.del(LOCK_KEY);
    }
  }

  private nomba() {
    return this.config.get<AppNomba>('nomba') as AppNomba;
  }

  // Tokens last 30 min; we store expiry conservatively at 29 min.
  private async issueToken(): Promise<CachedToken> {
    const cfg = this.nomba();
    const { data } = await axios.post(
      `${cfg.baseUrl}/auth/token/issue`,
      {
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      },
      { headers: { 'Content-Type': 'application/json', accountId: cfg.accountId } },
    );
    return this.normalize(data);
  }

  private async exchangeRefreshToken(refreshToken: string): Promise<CachedToken> {
    const cfg = this.nomba();
    const { data } = await axios.post(
      `${cfg.baseUrl}/auth/token/refresh`,
      { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cfg.clientId },
      { headers: { 'Content-Type': 'application/json', accountId: cfg.accountId } },
    );
    return this.normalize(data);
  }

  // Nomba wraps results as { data: { access_token, refresh_token, ... } }.
  // Field names confirmed against sandbox responses on first run.
  private normalize(payload: any): CachedToken {
    const d = payload?.data ?? payload;
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: Date.now() + 29 * 60_000,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

interface AppNomba {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  accountId: string;
  webhookSignatureKey: string;
  webhookSigAlgo: string;
}