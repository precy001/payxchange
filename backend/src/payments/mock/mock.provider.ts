import { Injectable, Logger } from '@nestjs/common';
import {
  BankLookupInput,
  BankLookupResult,
  CheckoutOrderResult,
  ChargeResult,
  ChargeTokenizedCardInput,
  CreateCheckoutInput,
  PaymentProvider,
  TransferResult,
  TransferToBankInput,
} from '../payment-provider.interface';

// A stand-in for a real provider that behaves predictably. It lets us exercise
// the ENTIRE money flow — state machine, ledger, saga — with zero network calls
// and zero Nomba keys. Because it implements the exact same interface as the
// real provider, switching later is a one-line config change.
//
// PAYOUT TESTING: set MOCK_PAYOUT_OUTCOME in .env to drive the payout leg:
//   success  (default) -> transfer succeeds, transaction completes
//   fail               -> transfer fails; after retries the payer is refunded
//   timeout            -> transfer is UNKNOWN; a requery resolves it to success
//                          (proves we never refund/double-pay on a timeout)

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly usesHostedCheckout = false; // mock charges synchronously
  canAutoCharge(): boolean {
    return true; // mock charges anything
  }
  private readonly logger = new Logger(MockPaymentProvider.name);

  private outcome(): 'success' | 'fail' | 'timeout' | 'pending' {
    const v = (process.env.MOCK_PAYOUT_OUTCOME || 'success').toLowerCase();
    return v === 'fail' || v === 'timeout' || v === 'pending' ? v : 'success';
  }

  async chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult> {
    this.logger.log(`[mock] charge ${input.amountKobo} kobo ref=${input.reference}`);
    return {
      success: true,
      providerReference: `mock_chg_${input.reference}`,
      status: 'success',
      raw: { mock: true, ...input },
    };
  }

  // Not used (usesHostedCheckout is false) but required by the interface.
  async createCheckoutOrder(input: CreateCheckoutInput): Promise<CheckoutOrderResult> {
    return {
      checkoutUrl: `https://mock.local/checkout/${input.orderReference}`,
      orderReference: input.orderReference,
      raw: { mock: true },
    };
  }

  async verifyCheckoutPayment(): Promise<import('../payment-provider.interface').CheckoutVerification> {
    return { paid: true }; // mock payments always "succeed"
  }

  async lookupBankAccount(input: BankLookupInput): Promise<BankLookupResult> {
    return {
      accountName: 'MOCK ACCOUNT HOLDER',
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    };
  }

  async transferToBank(input: TransferToBankInput): Promise<TransferResult> {
    const outcome = this.outcome();
    this.logger.log(`[mock] payout ${input.amountKobo} kobo ref=${input.reference} outcome=${outcome}`);
    if (outcome === 'fail') {
      return { status: 'failed', providerReference: `mock_tr_${input.reference}`, raw: { mock: true, outcome } };
    }
    if (outcome === 'timeout') {
      return { status: 'unknown', providerReference: `mock_tr_${input.reference}`, raw: { mock: true, outcome } };
    }
    if (outcome === 'pending') {
      // Accepted but not yet settled — stays in payout_pending until a webhook
      // (or simulate) reports the final result.
      return { status: 'pending', providerReference: `mock_tr_${input.reference}`, raw: { mock: true, outcome } };
    }
    return {
      status: 'success',
      providerReference: `mock_tr_${input.reference}`,
      sessionId: `mock_sess_${input.reference}`,
      raw: { mock: true, outcome },
    };
  }

  async requeryTransfer(reference: string): Promise<TransferResult> {
    const outcome = this.outcome();
    // On 'fail' the requery confirms it did NOT go through (safe to refund).
    if (outcome === 'fail') {
      return { status: 'failed', providerReference: `mock_tr_${reference}`, raw: { mock: true, outcome } };
    }
    if (outcome === 'pending') {
      return { status: 'pending', providerReference: `mock_tr_${reference}`, raw: { mock: true, outcome } };
    }
    // On 'timeout' the transfer actually landed — requery reveals success.
    return {
      status: 'success',
      providerReference: `mock_tr_${reference}`,
      sessionId: `mock_sess_${reference}`,
      raw: { mock: true, outcome },
    };
  }

  verifyWebhookSignature(): boolean {
    return true; // mock mode trusts everything
  }
}