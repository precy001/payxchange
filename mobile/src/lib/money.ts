// All money is integer kobo, mirroring the backend. These helpers only format
// for display and parse user input — they never store floats.

export function formatNaira(kobo: number): string {
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100);
  const k = abs % 100;
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = k ? '.' + String(k).padStart(2, '0') : '';
  return (negative ? '-' : '') + '\u20A6' + grouped + fraction;
}

// Parse a naira string from an input into integer kobo. Returns null if invalid.
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}