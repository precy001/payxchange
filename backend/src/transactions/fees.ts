// PayXchange transaction fee, charged ON TOP of the amount (paid by the payer).
// Tiers (amount is what the payee requested):
//   ≤ ₦5,000            -> ₦1
//   ₦5,001 – ₦10,000    -> ₦2
//   ≥ ₦10,001           -> ₦3
// All values in kobo (₦1 = 100 kobo).
export function computeFeeKobo(amountKobo: number): number {
  if (amountKobo <= 500_000) return 100; // ₦1
  if (amountKobo <= 1_000_000) return 200; // ₦2
  return 300; // ₦3
}