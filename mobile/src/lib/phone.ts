// Mirrors the backend (backend/src/common/phone.ts) so the app accepts a number
// typed any of the ways Nigerians actually type it, and always sends ONE form.
//   09162542339 / 9162542339 / 2349162542339 / +2349162542339 / "0916 254 2339"
//        -> +2349162542339
const DEFAULT_COUNTRY_CODE = '234';
const NG_NSN_LENGTH = 10;

export function normalizePhone(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  if (hadPlus) return `+${digits}`;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length > NG_NSN_LENGTH) return `+${digits}`;
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.length === NG_NSN_LENGTH) return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  return `+${digits}`;
}

// Valid once normalised: + followed by 8–15 digits, first digit non-zero.
export function isValidPhone(input: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(input));
}