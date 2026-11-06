/**
 * Money is always an integer count of the currency's smallest unit (paise, cents, yen), so
 * totals never pick up floating-point drift. Conversion to and from text happens only here.
 */

/** Keeps `amount * weight` in the ledger inside safe integer range. About 1 billion rupees. */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

/** ISO 4217 exceptions; every other currency has 2 decimals. */
const ZERO_DECIMAL = new Set('BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX VND VUV XAF XOF XPF'.split(' '));
const THREE_DECIMAL = new Set('BHD IQD JOD KWD LYD OMR TND'.split(' '));

export function minorDigits(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  return THREE_DECIMAL.has(currency) ? 3 : 2;
}

/** Offered when choosing a trip's currency, most likely first. */
export const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'THB',
  'IDR',
  'MYR',
  'VND',
  'JPY',
  'KRW',
  'CNY',
  'HKD',
  'AUD',
  'NZD',
  'CAD',
  'CHF',
  'BRL',
  'MXN',
  'ZAR',
  'LKR',
  'NPR',
  'PHP',
  'SAR',
  'TRY',
] as const;

const REGION_CURRENCY: Record<string, (typeof CURRENCIES)[number]> = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  AE: 'AED',
  SG: 'SGD',
  TH: 'THB',
  ID: 'IDR',
  MY: 'MYR',
  VN: 'VND',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  HK: 'HKD',
  AU: 'AUD',
  NZ: 'NZD',
  CA: 'CAD',
  CH: 'CHF',
  BR: 'BRL',
  MX: 'MXN',
  ZA: 'ZAR',
  LK: 'LKR',
  NP: 'NPR',
  PH: 'PHP',
  SA: 'SAR',
  TR: 'TRY',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
};

/** The currency of the device's region, e.g. `en-IN` → INR. */
export function defaultCurrency(locale = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const region = locale.split(/[-_]/).find((part) => /^[A-Z]{2}$/.test(part));
  return (region && REGION_CURRENCY[region]) || 'USD';
}

/** "₹2,400" for whole amounts, "₹2,400.50" otherwise. */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const digits = minorDigits(currency);
  const whole = minor % 10 ** digits === 0;
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : digits,
      maximumFractionDigits: whole ? 0 : digits,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(whole ? 0 : digits)}`;
  }
}

/** The plain number to show in an amount field: 240050 → "2400.50". */
export function minorToInput(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const major = (minor / 10 ** digits).toFixed(digits);
  return minor % 10 ** digits === 0 ? String(minor / 10 ** digits) : major;
}

/**
 * Read what someone typed into an amount field. Accepts "1200.50", "1,200.50" and "1.200,50".
 * A lone separator followed by exactly three digits is a thousands separator, unless the
 * currency has three decimals. Returns undefined for anything that isn't a valid amount.
 */
export function parseAmount(text: string, currency: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(cleaned)) return undefined;
  const digits = minorDigits(currency);

  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let whole = cleaned;
  let fraction = '';
  if (lastSeparator !== -1) {
    const tail = cleaned.slice(lastSeparator + 1);
    const usesBoth = cleaned.includes('.') && cleaned.includes(',');
    const repeated = cleaned.indexOf(cleaned[lastSeparator]) !== lastSeparator;
    const isThousands = !usesBoth && (repeated || (tail.length === 3 && digits !== 3));
    if (!isThousands) {
      whole = cleaned.slice(0, lastSeparator);
      fraction = tail;
    }
  }
  whole = whole.replace(/[.,]/g, '');
  if (fraction.length > digits) return undefined;

  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_AMOUNT_MINOR ? minor : undefined;
}

/** Convert using `rate`: how many whole `to` units one whole `from` unit buys. */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  return Math.round((minor / 10 ** minorDigits(from)) * rate * 10 ** minorDigits(to));
}

/** The rate implied by what was paid and what the bank charged for it. */
export function impliedRate(fromMinor: number, from: string, toMinor: number, to: string): number {
  return toMinor / 10 ** minorDigits(to) / (fromMinor / 10 ** minorDigits(from));
}

/** "1 THB = 2.824 INR". */
export function formatRate(rate: number, from: string, to: string, locale?: string): string {
  const value = new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(rate);
  return `1 ${from} = ${value} ${to}`;
}
