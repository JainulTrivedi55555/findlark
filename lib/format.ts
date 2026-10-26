// Small display formatters shared by the UI. Pure.

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function relativeDate(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  if (Number.isNaN(seconds)) return '';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** "1 person", "3,394 people". */
export function peopleCount(n: number): string {
  return n === 1 ? '1 person' : `${n.toLocaleString('en-US')} people`;
}

/** "8 yrs", "1 yr", "Under 1 yr". */
export function yearsShort(n: number): string {
  if (n < 1) return 'Under 1 yr';
  return n === 1 ? '1 yr' : `${n} yrs`;
}
