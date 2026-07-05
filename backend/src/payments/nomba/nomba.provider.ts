import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  BankLookupInput,
  BankLookupResult,
  CheckoutOrderResult,
  ChargeResult,
  ChargeTokenizedCardInput,
  CreateCheckoutInput,
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
  readonly usesHostedCheckout = true; // inbound is Nomba Checkout, not a token charge
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

  // True when no real credentials are set => no-signup sandbox mode.
  private get noAuth(): boolean {
    const cid = (this.config.get<{ clientId: string }>('nomba')?.clientId ?? '').trim();
    return !cid || cid.startsWith('your_');
  }

  // Hosted checkout: create an order and return the link the payer pays on.
  // Works in the no-signup sandbox too (no auth headers).
  async createCheckoutOrder(input: CreateCheckoutInput): Promise<CheckoutOrderResult> {
    const res = await this.client.post('/v1/checkout/order', {
      order: {
        orderReference: input.orderReference,
        amount: this.koboToNaira(input.amountKobo),
        currency: input.currency,
        customerEmail: input.customerEmail,
        callbackUrl: input.callbackUrl,
      },
    });
    const link = res?.data?.checkoutLink;
    if (!link) {
      throw new Error(`Checkout order failed: ${res?.description ?? 'no checkout link returned'}`);
    }
    this.logger.log(`[nomba] /v1/checkout/order ref=${input.orderReference} code=${res?.code}`);
    return { checkoutUrl: link, orderReference: input.orderReference, raw: res };
  }

  // The no-signup sandbox has no authenticated status lookup, so we can't verify
  // on demand — confirmation there comes via the webhook (or the dev simulate).
  async verifyCheckoutPayment(): Promise<import('../payment-provider.interface').CheckoutVerification> {
    return { paid: false };
  }

  async chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult> {
    // The real tokenized-charge endpoint needs auth, and the live pay leg is
    // moving to hosted Checkout anyway. In the no-signup sandbox we shim the
    // charge to success so the flow reaches the REAL Nomba payout, which is the
    // leg we're testing here.
    if (this.noAuth) {
      this.logger.warn(`[sandbox no-auth] charge shimmed to success ref=${input.reference}`);
      return {
        success: true,
        providerReference: `sbx_chg_${input.reference}`,
        status: 'sandbox_shim_success',
        raw: { sandboxShim: true },
      };
    }

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
      const res = await this.client.post('/v2/transfers/bank', {
        amount: Number(this.koboToNaira(input.amountKobo)),
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        bankCode: input.bankCode,
        merchantTxRef: input.reference,
        senderName: 'PayXchange',
        narration: input.narration,
      });
      this.logger.log(
        `[nomba] /v2/transfers/bank ref=${input.reference} code=${res?.code} desc=${res?.description} status=${res?.data?.status}`,
      );
      return this.mapTransfer(res);
    } catch (err: any) {
      // A network timeout does NOT mean the transfer failed — it may have gone
      // through. Return UNKNOWN so the saga requeries instead of compensating.
      if (err?.code === 'ECONNABORTED' || !err?.response) {
        this.logger.warn(`Transfer ${input.reference} timed out — needs requery`);
        return { status: 'unknown', raw: err?.message ?? 'timeout' };
      }
      // Nomba rejected the request (e.g. 422 validation). Log its explanation so
      // we can see exactly which field it didn't like.
      this.logger.error(
        `[nomba] transfer rejected ref=${input.reference} status=${err.response.status} body=${JSON.stringify(err.response.data)}`,
      );
      throw err;
    }
  }

  async requeryTransfer(reference: string): Promise<TransferResult> {
    try {
      const res = await this.client.get(
        `/transactions/accounts?merchantTxRef=${encodeURIComponent(reference)}`,
      );
      const row = res?.data?.results?.[0] ?? res?.data;
      return this.mapTransfer({ code: res?.code, data: row });
    } catch (err: any) {
      // The lookup endpoint needs auth, which the no-signup sandbox doesn't have.
      // Can't confirm => UNKNOWN, so the saga neither double-pays nor wrongly refunds.
      this.logger.warn(`Requery ${reference} unavailable: ${err?.message ?? err}`);
      return { status: 'unknown', raw: err?.message ?? 'requery unavailable' };
    }
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
    // No signing key => no-signup sandbox: we can't verify, so trust it (same
    // posture as the mock). Production sets the key and this becomes a real check.
    if (!cfg.webhookSignatureKey) return true;
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