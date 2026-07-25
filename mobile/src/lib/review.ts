import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

// Asking for a review at the wrong moment is how apps earn 1-star ratings. We
// only ask after the user has had a genuinely good experience — a payment that
// COMPLETED — and never more than once, and not on their very first payment.
const COUNT_KEY = 'px_completed_payments';
const ASKED_KEY = 'px_review_asked';
const ASK_AFTER = 2; // ask on the 2nd successful payment

// Call this when a payment reaches "completed".
export async function maybeAskForReview(): Promise<void> {
  try {
    const asked = await SecureStore.getItemAsync(ASKED_KEY);
    if (asked) return; // never nag twice

    const count = Number((await SecureStore.getItemAsync(COUNT_KEY)) ?? '0') + 1;
    await SecureStore.setItemAsync(COUNT_KEY, String(count));
    if (count < ASK_AFTER) return;

    // The OS decides whether to actually show the dialog (it rate-limits this),
    // so we mark it asked either way rather than pestering on every payment.
    const available = await StoreReview.isAvailableAsync();
    const hasAction = await StoreReview.hasAction();
    if (available && hasAction) {
      await SecureStore.setItemAsync(ASKED_KEY, '1');
      // Give the success screen a beat to settle before the dialog appears.
      setTimeout(() => {
        StoreReview.requestReview().catch(() => undefined);
      }, 1200);
    }
  } catch {
    // A review prompt must never break the payment flow.
  }
}

// "Rate PayXchange" in Profile — an explicit, user-initiated request.
export async function openStoreReview(): Promise<void> {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  } catch {
    // ignore
  }
}