import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  BankLookupInput,
  BankLookupResult,
  ChargeResult,
  ChargeTokenizedCardInput,
  PaymentProvider,
  TransferResult,
  TransferStatus,
  TransferToBankInput,
} from '../payment-provider.interface';
import { NombaClient } from './nomba.client';

// Nomba implementation of the provider contract. This is the ONLY file that
// knows Nomba's endpoints, payload shapes and money units. Convert kobo -> the
// naira value Nomba expects here and nowhere else.

@Injectable()
export class NombaProvider implements PaymentProvider {
  readonly name = 'nomba';
  private readonly logger = new Logger(NombaProvider.name);

  constructor(
    private readonly client: NombaClient,
    private readonly config: ConfigService,
  ) {}

  // Nomba charge amounts are naira (major unit). Our core is kobo. Convert
  // using integer math only — never floating point — so there's zero chance of
  // a rounding artifact on a money value.
  private koboToNaira(kobo: number): string {
    const naira = Math.trunc(kobo / 100);
    const remainder = Math.abs(kobo % 100);
    return `${naira}.${String(remainder).padStart(2, '0')}`;
  }

  async chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult> {
    const body: any = {
      order: {
        orderReference: input.reference,
        customerId: input.customerId,
        customerEmail: input.customerEmail,
        callbackUrl: input.callbackUrl,
        amount: this.koboToNaira(input.amountKobo),
        currency: input.currency,
      },
      tokenKey: input.tokenKey,
    };
    if (input.split?.length) {
      body.order.splitRequest = {
        splitType: input.split[0].type,
        splitList: input.split.map((s) => ({ accountId: s.accountId, value: s.value })),
      };
    }

    const res = await this.client.post('/checkout/tokenized-card-payment', body);
    const ok = res?.code === '00';
    return {
      success: ok,
      providerReference: res?.data?.transactionId ?? input.reference,
      status: res?.description ?? (ok ? 'success' : 'failed'),
      raw: res,
    };
  }

  async lookupBankAccount(input: BankLookupInput): Promise<BankLookupResult> {
    const res = await this.client.post('/transfers/bank/lookup', {
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    });
    if (res?.code !== '00' || !res?.data?.accountName) {
      throw new Error(`Account lookup failed: ${res?.description ?? 'unknown'}`);
    }
    return {
      accountName: res.data.accountName,
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    };
  }

  async transferToBank(input: TransferToBankInput): Promise<TransferResult> {
    try {
      const res = await this.client.post('/transfers/bank', {
        amount: this.koboToNaira(input.amountKobo),
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        accountName: input.accountName,
        merchantTxRef: input.reference,
        narration: input.narration,
      });
      return this.mapTransfer(res);
    } catch (err: any) {
      // A network timeout does NOT mean the transfer failed — it may have gone
      // through. Return UNKNOWN so the saga requeries instead of compensating.
      if (err?.code === 'ECONNABORTED' || !err?.response) {
        this.logger.warn(`Transfer ${input.reference} timed out — needs requery`);
        return { status: 'unknown', raw: err?.message ?? 'timeout' };
      }
      throw err;
    }
  }

  async requeryTransfer(reference: string): Promise<TransferResult> {
    const res = await this.client.get(
      `/transactions/accounts?merchantTxRef=${encodeURIComponent(reference)}`,
    );
    const row = res?.data?.results?.[0] ?? res?.data;
    return this.mapTransfer({ code: res?.code, data: row });
  }

  private mapTransfer(res: any): TransferResult {
    const status = String(res?.data?.status ?? res?.description ?? '').toUpperCase();
    let mapped: TransferStatus = 'unknown';
    if (res?.code === '00' || status.includes('SUCCESS')) mapped = 'success';
    else if (status.includes('PENDING') || status.includes('PROCESSING')) mapped = 'pending';
    else if (status.includes('REVERS')) mapped = 'reversed';
    else if (status.includes('FAIL')) mapped = 'failed';
    return {
      status: mapped,
      providerReference: res?.data?.id,
      sessionId: res?.data?.sessionId ?? res?.data?.nipSessionId,
      raw: res,
    };
  }

  // Verify the webhook HMAC over the EXACT raw request body (not re-serialized
  // JSON — key order would differ and break the signature).
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    const cfg = this.config.get<{ webhookSignatureKey: string; webhookSigAlgo: string }>('nomba')!;
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac(cfg.webhookSigAlgo, cfg.webhookSignatureKey)
      .update(rawBody)
      .digest('hex');
    // Constant-time compare to avoid timing attacks.
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}