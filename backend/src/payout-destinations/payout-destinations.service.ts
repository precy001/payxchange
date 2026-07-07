import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../infra/redis.module';
import { PayoutDestinationRow, PayoutDestinationsRepository } from './payout-destinations.repository';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.interface';

@Injectable()
export class PayoutDestinationsService {
  constructor(
    private readonly repo: PayoutDestinationsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private toPublic(d: PayoutDestinationRow) {
    return {
      id: d.id,
      bankCode: d.bank_code,
      accountNumber: d.account_number,
      accountName: d.account_name,
      isDefault: d.is_default,
      createdAt: d.created_at,
    };
  }

  listBanks() {
    return this.provider.listBanks();
  }

  // Resolve the account name, cached so a given account only hits the provider
  // once per day. This is what keeps us under the provider's (strict) resolve
  // rate limit. Only successful names are cached, so a throttled miss retries.
  private async resolveName(accountNumber: string, bankCode: string): Promise<string> {
    const key = `resolve:${bankCode}:${accountNumber}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) return cached;
    } catch {
      // cache miss / redis blip — fall through to a live lookup
    }
    const res = await this.provider.lookupBankAccount({ accountNumber, bankCode });
    if (res.accountName) {
      await this.redis.set(key, res.accountName, 'EX', 86400).catch(() => undefined);
    }
    return res.accountName ?? '';
  }

  // Preview the account holder's name before saving (graceful — null if the
  // provider can't resolve, e.g. rate-limited or gated on a starter account).
  async resolve(accountNumber: string, bankCode: string) {
    const name = await this.resolveName(accountNumber, bankCode);
    return { accountName: name || null };
  }

  async list(userId: string) {
    const rows = await this.repo.listByUser(userId);
    return rows.map((r) => this.toPublic(r));
  }

  async add(userId: string, input: { bankCode: string; accountNumber: string; accountName?: string }) {
    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw new BadRequestException('Account number must be 10 digits');
    }
    // Reuses the cached resolve (from the preview), so saving doesn't spend
    // another provider call. Falls back to the name the user entered.
    const resolved = await this.resolveName(input.accountNumber, input.bankCode);
    const accountName = resolved || input.accountName?.trim() || 'Account holder';

    const isDefault = (await this.repo.countForUser(userId)) === 0;
    const row = await this.repo.upsert({
      userId,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName,
      isDefault,
    });
    return this.toPublic(row);
  }

  async makeDefault(userId: string, id: string) {
    await this.repo.makeDefault(userId, id);
    return { message: 'Default payout account updated' };
  }

  async remove(userId: string, id: string) {
    const removed = await this.repo.deleteForUser(userId, id);
    return { removed };
  }
}