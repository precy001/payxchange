// Phone numbers are the login identity, so every entry point must agree on ONE
// canonical form — otherwise "09162542339" registers a different account from
// "+2349162542339" and login silently fails.
//
// We normalise to E.164 with a Nigerian default:
//   09162542339    -> +2349162542339   (local, leading 0 dropped)
//   9162542339     -> +2349162542339   (national, no leading 0)
//   2349162542339  -> +2349162542339   (country code, no +)
//   +2349162542339 -> +2349162542339   (already canonical)
// Spaces, dashes, dots and brackets are ignored: "0916 254 2339" works too.
//
// Numbers already given in international form (with +) are respected as-is, so
// non-Nigerian numbers still work.

const DEFAULT_COUNTRY_CODE = '234';
const NG_NSN_LENGTH = 10; // national significant number, e.g. 9162542339

export function normalizePhone(input: unknown): unknown {
  if (typeof input !== 'string') return input; // let the validator reject it

  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed; // garbage in — let validation fail loudly

  // Explicit international number: trust the caller's country code.
  if (hadPlus) return `+${digits}`;

  // Country code without the plus, e.g. 2349162542339.
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length > NG_NSN_LENGTH) {
    return `+${digits}`;
  }

  // Local format with the trunk prefix, e.g. 09162542339.
  if (digits.startsWith('0')) {
    return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  // National significant number, e.g. 9162542339.
  if (digits.length === NG_NSN_LENGTH) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  // Anything else: treat as international and let the validator decide.
  return `+${digits}`;
}