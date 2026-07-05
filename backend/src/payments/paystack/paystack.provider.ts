import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import {
  BankLookupInput,
  BankLookupResult,
  ChargeResult,
  ChargeTokenizedCardInput,
  CheckoutOrderResult,
  CheckoutVerification,
  CreateCheckoutInput,
  PaymentProvider,
  TransferResult,
  TransferStatus,
  TransferToBankInput,
} from '../payment-provider.interface';

// Paystack adapter. Inbound = Initialize Transaction (hosted checkout) confirmed
// by the charge.success webhook. Outbound = create recipient + initiate transfer,
// resolved by transfer.success/transfer.failed webhooks (or Verify Transfer).
// All amounts crossing this boundary are kobo — Paystack also uses kobo, so no
// conversion is needed.
@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  readonly usesHostedCheckout = true;
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly http: AxiosInstance;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    const ps = this.config.get<{ baseUrl: string; secretKey: string }>('paystack')!;
    this.secretKey = ps.secretKey;
    this.http = axios.create({
      baseURL: ps.baseUrl,
      timeout: 30_000,
      headers: { Authorization: `Bearer ${ps.secretKey}`, 'Content-Type': 'application/json' },
    });
  }

  // Inbound: initialize a transaction and return the hosted checkout URL.
  async createCheckoutOrder(input: CreateCheckoutInput): Promise<CheckoutOrderResult> {
    const res = await this.http.post('/transaction/initialize', {
      email: input.customerEmail,
      amount: input.amountKobo, // kobo
      reference: input.orderReference,
      // Browser redirect after payment. We point it at a marker the app's
      // WebView detects (it is NOT loaded), so payment finishing triggers an
      // immediate verify — and we never bounce the payer to the ngrok page.
      callback_url: 'https://payxchange.app/paid',
      currency: input.currency,
    });
    const data = res.data?.data;
    if (!data?.authorization_url) {
      throw new Error(`Paystack init failed: ${res.data?.message ?? 'no authorization_url'}`);
    }
    this.logger.log(`[paystack] /transaction/initialize ref=${input.orderReference} status=${res.data?.status}`);
    return {
      checkoutUrl: data.authorization_url,
      orderReference: data.reference ?? input.orderReference,
      raw: res.data,
    };
  }

  // Ask Paystack directly whether this reference was paid — no webhook needed.
  // Also returns the reusable card token so future payments can be auto-charged.
  async verifyCheckoutPayment(reference: string): Promise<CheckoutVerification> {
    try {
      const res = await this.http.get(`/transaction/verify/${encodeURIComponent(reference)}`);
      const d = res.data?.data;
      const status = d?.status;
      this.logger.log(`[paystack] /transaction/verify ref=${reference} status=${status}`);
      if (status !== 'success') return { paid: false };
      const auth = d?.authorization;
      const card =
        auth?.authorization_code && auth?.reusable
          ? {
              token: auth.authorization_code,
              last4: auth.last4,
              brand: auth.card_type,
              bank: auth.bank,
              expMonth: auth.exp_month,
              expYear: auth.exp_year,
            }
          : undefined;
      return { paid: true, card };
    } catch (err: any) {
      this.logger.warn(`[paystack] verify ${reference} failed: ${err?.response?.status ?? err?.message}`);
      return { paid: false };
    }
  }

  // Silent server-side charge of a previously-saved card (charge authorization).
  // This is the auto-debit path — no customer interaction, no WebView.
  async chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult> {
    try {
      const res = await this.http.post('/transaction/charge_authorization', {
        authorization_code: input.tokenKey,
        email: input.customerEmail,
        amount: input.amountKobo,
        reference: input.reference,
        currency: input.currency,
      });
      const d = res.data?.data;
      this.logger.log(`[paystack] /charge_authorization ref=${input.reference} status=${d?.status}`);
      return {
        success: d?.status === 'success',
        providerReference: d?.reference ?? input.reference,
        status: d?.status ?? 'unknown',
        raw: res.data,
      };
    } catch (err: any) {
      this.logger.error(
        `[paystack] charge_authorization failed ref=${input.reference}: ${JSON.stringify(err?.response?.data ?? err?.message)}`,
      );
      return { success: false, providerReference: input.reference, status: 'error', raw: err?.response?.data };
    }
  }

  async lookupBankAccount(input: BankLookupInput): Promise<BankLookupResult> {
    const res = await this.http.get(
      `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
    );
    const data = res.data?.data;
    return {
      accountName: data?.account_name ?? '',
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    };
  }

  // Payout: create a transfer recipient, then initiate the transfer.
  async transferToBank(input: TransferToBankInput): Promise<TransferResult> {
    try {
      const rec = await this.http.post('/transferrecipient', {
        type: 'nuban',
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'NGN',
      });
      const recipientCode = rec.data?.data?.recipient_code;
      if (!recipientCode) {
        this.logger.error(`[paystack] recipient failed: ${JSON.stringify(rec.data)}`);
        return { status: 'failed', raw: rec.data };
      }

      const tr = await this.http.post('/transfer', {
        source: 'balance',
        amount: input.amountKobo,
        recipient: recipientCode,
        reference: input.reference,
        reason: input.narration,
      });
      const d = tr.data?.data;
      this.logger.log(`[paystack] /transfer ref=${input.reference} status=${d?.status}`);

      if (d?.status === 'otp') {
        // OTP approval is on — a fully automated payout can't complete this.
        this.logger.warn(
          '[paystack] transfer needs OTP. Disable "Confirm transfers before sending" in Dashboard → Preferences for automation.',
        );
        return { status: 'pending', providerReference: d?.transfer_code, raw: tr.data };
      }
      return {
        status: this.mapStatus(d?.status),
        providerReference: d?.transfer_code,
        sessionId: d?.reference,
        raw: tr.data,
      };
    } catch (err: any) {
      // A timeout is UNKNOWN, not failed — the saga must requery before refunding.
      if (err?.code === 'ECONNABORTED' || !err?.response) {
        this.logger.warn(`[paystack] transfer ${input.reference} timed out — needs requery`);
        return { status: 'unknown', raw: err?.message ?? 'timeout' };
      }
      // A definite error response (e.g. insufficient balance) is a real failure.
      this.logger.error(
        `[paystack] transfer rejected ref=${input.reference} status=${err.response.status} body=${JSON.stringify(err.response.data)}`,
      );
      return { status: 'failed', raw: err.response.data };
    }
  }

  async requeryTransfer(reference: string): Promise<TransferResult> {
    try {
      const res = await this.http.get(`/transfer/verify/${encodeURIComponent(reference)}`);
      const d = res.data?.data;
      return {
        status: this.mapStatus(d?.status),
        providerReference: d?.transfer_code,
        sessionId: d?.reference,
        raw: res.data,
      };
    } catch (err: any) {
      return { status: 'unknown', raw: err?.response?.data ?? err?.message };
    }
  }

  private mapStatus(s?: string): TransferStatus {
    switch (s) {
      case 'success':
        return 'success';
      case 'pending':
      case 'otp':
      case 'received':
      case 'processing':
        return 'pending';
      case 'failed':
      case 'abandoned':
      case 'blocked':
        return 'failed';
      case 'reversed':
        return 'reversed';
      default:
        return 'unknown';
    }
  }

  // Paystack signs the raw body with HMAC-SHA512 using your secret key.
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!this.secretKey) return true; // nothing to verify against
    if (!signatureHeader) return false;
    const expected = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}