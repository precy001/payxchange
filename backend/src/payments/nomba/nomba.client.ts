import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { NombaTokenService } from './nomba-token.service';

// Thin HTTP wrapper. Every request carries a fresh bearer token + the accountId
// header. If Nomba returns 401 (token rotated / session reset), we force a
// single token refresh and retry once — anything beyond that surfaces as an
// error for the caller to handle.

@Injectable()
export class NombaClient {
  private readonly logger = new Logger(NombaClient.name);
  private readonly http: AxiosInstance;
  private readonly accountId: string;
  private readonly noAuth: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: NombaTokenService,
  ) {
    const nomba = this.config.get<{ baseUrl: string; accountId: string; clientId: string }>('nomba')!;
    this.accountId = nomba.accountId;
    // No real client credentials => sandbox no-signup mode: send no auth headers.
    // Placeholder values (e.g. "your_sandbox_client_id") count as not-set.
    const cid = (nomba.clientId ?? '').trim();
    this.noAuth = !cid || cid.startsWith('your_');
    this.http = axios.create({ baseURL: nomba.baseUrl, timeout: 30_000 });
    if (this.noAuth) {
      this.logger.warn('Nomba client running in no-auth sandbox mode (no credentials set)');
    }
  }

  async post<T = any>(path: string, body: unknown): Promise<T> {
    return this.send<T>({ method: 'POST', url: path, data: body });
  }

  async get<T = any>(path: string): Promise<T> {
    return this.send<T>({ method: 'GET', url: path });
  }

  private async send<T>(cfg: AxiosRequestConfig, isRetry = false): Promise<T> {
    // Sandbox no-auth: just send the request, no token, no accountId.
    if (this.noAuth) {
      const res = await this.http.request<T>({
        ...cfg,
        headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
      });
      return res.data;
    }

    const token = await this.tokens.getAccessToken();
    try {
      const res = await this.http.request<T>({
        ...cfg,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          accountId: this.accountId,
          ...(cfg.headers ?? {}),
        },
      });
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401 && !isRetry) {
        this.logger.warn('Nomba 401 — forcing token refresh and retrying once');
        await this.tokens.getAccessToken(true);
        return this.send<T>(cfg, true);
      }
      throw err;
    }
  }
}