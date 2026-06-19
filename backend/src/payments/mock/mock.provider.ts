import { Injectable, Logger } from '@nestjs/common';
import {
  BankLookupInput,
  BankLookupResult,
  ChargeResult,
  ChargeTokenizedCardInput,
  PaymentProvider,
  TransferResult,
  TransferToBankInput,
} from '../payment-provider.interface';

// A stand-in for a real provider that always behaves predictably. It lets us
// build and exercise the ENTIRE money flow — state machine, ledger, saga —
// with zero network calls and zero Nomba keys. Because it implements the exact
// same interface as NombaProvider, switching to the real thing later is a
// one-line config change and the rest of the app never notices.

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentProvider.name);

  async chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult> {
    this.logger.log(`[mock] charge ${input.amountKobo} kobo ref=${input.reference}`);
    return {
      success: true,
      providerReference: `mock_chg_${input.reference}`,
      status: 'success',
      raw: { mock: true, ...input },
    };
  }

  async lookupBankAccount(input: BankLookupInput): Promise<BankLookupResult> {
    return {
      accountName: 'MOCK ACCOUNT HOLDER',
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    };
  }

  async transferToBank(input: TransferToBankInput): Promise<TransferResult> {
    this.logger.log(`[mock] payout ${input.amountKobo} kobo ref=${input.reference}`);
    return {
      status: 'success',
      providerReference: `mock_tr_${input.reference}`,
      sessionId: `mock_sess_${input.reference}`,
      raw: { mock: true, ...input },
    };
  }

  async requeryTransfer(reference: string): Promise<TransferResult> {
    return {
      status: 'success',
      providerReference: `mock_tr_${reference}`,
      sessionId: `mock_sess_${reference}`,
      raw: { mock: true, reference },
    };
  }

  verifyWebhookSignature(): boolean {
    return true; // mock mode trusts everything
  }
}