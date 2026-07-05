// The abstraction that keeps the whole app provider-agnostic. Nothing in the
// domain (ledger, state machine, transactions) ever imports Nomba directly —
// it depends on this interface. Swapping/adding a provider (Squad, Paystack,
// whatever) means writing one new class that implements PaymentProvider.
//
// MONEY RULE: every amount crossing this boundary is integer KOBO. Conversion
// to a provider's preferred unit/format happens ONLY inside that provider's
// adapter, so the core never deals in floats or naira strings.

export interface ChargeTokenizedCardInput {
  amountKobo: number;
  currency: string; // 'NGN'
  customerEmail: string;
  customerId?: string;
  tokenKey: string; // the saved-card token
  reference: string; // our unique collection_ref (idempotency anchor)
  callbackUrl?: string;
  // Optional split so our platform fee is taken at charge time.
  split?: Array<{ accountId: string; value: string; type: 'PERCENTAGE' | 'FLAT' }>;
}

export interface ChargeResult {
  success: boolean;
  providerReference: string; // provider's own id for this charge
  status: string; // raw provider status, for audit
  raw: unknown;
}

// Hosted-checkout inbound: instead of charging a token server-side, we create
// an order and hand the payer a URL to pay on. Confirmation arrives by webhook.
export interface CreateCheckoutInput {
  amountKobo: number;
  currency: string; // 'NGN'
  customerEmail: string;
  orderReference: string; // our ref; echoed back on the webhook
  callbackUrl: string; // where the provider posts payment_success
}

export interface CheckoutOrderResult {
  checkoutUrl: string;
  orderReference: string;
  raw: unknown;
}

// A reusable card captured from a successful checkout, so future payments can be
// charged silently. `token` is the provider's card token — NOT raw card data.
export interface SavedCardInfo {
  token: string;
  last4?: string;
  brand?: string;
  bank?: string;
  expMonth?: string;
  expYear?: string;
}

export interface CheckoutVerification {
  paid: boolean;
  card?: SavedCardInfo; // present only if the card is reusable
}

export interface BankLookupInput {
  accountNumber: string;
  bankCode: string;
}

export interface BankLookupResult {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

export interface TransferToBankInput {
  amountKobo: number;
  accountNumber: string;
  bankCode: string;
  accountName: string; // from a prior lookup; never transfer without it
  reference: string; // unique per ATTEMPT — never reused on retry
  narration: string;
}

export type TransferStatus = 'success' | 'pending' | 'failed' | 'reversed' | 'unknown';

export interface TransferResult {
  status: TransferStatus;
  providerReference?: string;
  sessionId?: string; // NIP session id — proof it entered the rails
  raw: unknown;
}

// The contract every payment provider must satisfy.
export interface PaymentProvider {
  readonly name: string;

  // When true, the inbound leg uses createCheckoutOrder (+ webhook) instead of
  // a silent server-side charge. Lets the core branch the confirm flow.
  readonly usesHostedCheckout: boolean;

  chargeTokenizedCard(input: ChargeTokenizedCardInput): Promise<ChargeResult>;

  // Create a hosted checkout order; returns a URL for the payer to pay on.
  createCheckoutOrder(input: CreateCheckoutInput): Promise<CheckoutOrderResult>;

  // Actively verify an inbound checkout payment by our reference, independent of
  // the webhook. Returns whether it was paid and any reusable card to save.
  verifyCheckoutPayment(reference: string): Promise<CheckoutVerification>;

  lookupBankAccount(input: BankLookupInput): Promise<BankLookupResult>;

  // The P2P payout leg. A timeout here means UNKNOWN, not failed — callers
  // must requery before deciding to compensate.
  transferToBank(input: TransferToBankInput): Promise<TransferResult>;

  // Re-query a transfer by our reference to resolve an UNKNOWN outcome.
  requeryTransfer(reference: string): Promise<TransferResult>;

  // Verify an inbound webhook came from the provider (HMAC over raw body).
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;
}

// Injection token for the active provider.
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');