// The transaction state machine. This is the safety rail for all money
// movement: it defines which state changes are even POSSIBLE. Any attempt to
// make an illegal jump (e.g. pending -> payer_charged, skipping authorization,
// or charging an already-charged transaction) is a bug, and the code throws
// rather than moving money incorrectly.

export type TxnState =
  | 'pending'
  | 'authorized'
  | 'payer_charged'
  | 'payout_pending'
  | 'payout_sent'
  | 'completed'
  | 'payout_failed'
  | 'reversing'
  | 'reversed'
  | 'failed';

// From each state, the only states you're allowed to move to.
export const ALLOWED_TRANSITIONS: Record<TxnState, TxnState[]> = {
  pending: ['authorized', 'failed'],
  authorized: ['payer_charged', 'failed'],
  payer_charged: ['payout_pending', 'completed'], // completed = submerchant path (no payout leg)
  payout_pending: ['payout_sent', 'payout_failed'],
  payout_sent: ['completed', 'payout_failed'],
  payout_failed: ['reversing'],
  reversing: ['reversed'],
  reversed: [],
  completed: [],
  failed: [],
};

export function canTransition(from: TxnState, to: TxnState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TxnState, to: TxnState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal transaction transition: ${from} -> ${to}`);
  }
}
