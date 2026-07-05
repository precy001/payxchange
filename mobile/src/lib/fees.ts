// Mirrors the backend fee tiers (backend/src/transactions/fees.ts) so the pay
// screen can show the breakdown instantly. The backend remains the source of
// truth for the actual charge. Keep these two in sync.
//   ≤ ₦5,000 -> ₦1 | ₦5,001–₦10,000 -> ₦2 | ₦10,001+ -> ₦3
export function computeFeeKobo(amountKobo: number): number {
  if (amountKobo <= 500_000) return 100;
  if (amountKobo <= 1_000_000) return 200;
  return 300;
}