import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { RateSource } from '@/domain/models';
import { fetchJson } from '@/shared/lib/http';
import { logger } from '@/shared/lib/logger';
import { queryClient } from '@/shared/query/queryClient';
import { localDay } from '../dates';

/**
 * Exchange rates from free sources with no key, tried in order. A whole table is fetched for the
 * trip's currency and saved, so a currency nobody has used yet still has a rate offline.
 * Only currency codes and a date leave the phone.
 */
const FRANKFURTER = 'https://api.frankfurter.dev/v2/rates';
const CURRENCY_API = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const TIMEOUT_MS = 8_000;

/** Units of each currency that one unit of `base` buys. Dates can differ: not every source publishes daily. */
const RateTableSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.object({ rate: z.number().positive(), date: z.string() })),
});
export type RateTable = z.infer<typeof RateTableSchema>;

const FrankfurterSchema = z.array(z.object({ date: z.string(), quote: z.string(), rate: z.number() }));
const CurrencyApiSchema = z.object({ date: z.string() }).catchall(z.unknown());

/** Sources also list crypto and other tokens; a usable currency is three letters with a real rate. */
const usable = (code: string, rate: unknown): rate is number =>
  /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && rate > 0 && Number.isFinite(rate);

function table(base: string, entries: [code: string, rate: unknown, date: string][]): RateTable {
  const rates: RateTable['rates'] = {};
  for (const [code, rate, date] of entries) if (usable(code, rate)) rates[code] = { rate, date };
  if (Object.keys(rates).length === 0) throw new Error('No usable rates');
  return { base, rates };
}

async function fromFrankfurter(base: string, day: string, signal?: AbortSignal) {
  const url = `${FRANKFURTER}?date=${day}&base=${base}`;
  const rows = FrankfurterSchema.parse(await fetchJson(url, { signal, timeoutMs: TIMEOUT_MS }));
  return table(
    base,
    rows.map((r) => [r.quote, r.rate, r.date]),
  );
}

async function fromCurrencyApi(base: string, version: string, signal?: AbortSignal) {
  const code = base.toLowerCase();
  const url = `${CURRENCY_API}@${version}/v1/currencies/${code}.min.json`;
  const body = CurrencyApiSchema.parse(await fetchJson(url, { signal, timeoutMs: TIMEOUT_MS }));
  const rates = z.record(z.string(), z.unknown()).parse(body[code]);
  return table(
    base,
    Object.entries(rates).map(([quote, rate]) => [quote.toUpperCase(), rate, body.date]),
  );
}

/** Rates for a day, or the nearest available. Throws when every source fails. */
export async function fetchRates(base: string, day: string, signal?: AbortSignal): Promise<RateTable> {
  const asOf = day > localDay() ? localDay() : day;
  const sources = [
    () => fromFrankfurter(base, asOf, signal),
    () => fromCurrencyApi(base, asOf, signal),
    () => fromCurrencyApi(base, 'latest', signal),
  ];
  let lastError: unknown;
  for (const source of sources) {
    try {
      return await source();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const cacheKey = (base: string) => `travyy-rates-v1-${base}`;

export async function readSavedRates(base: string): Promise<RateTable | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(base));
    const parsed = RateTableSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function newestDate(rates: RateTable): string {
  return Object.values(rates.rates).reduce((newest, r) => (r.date > newest ? r.date : newest), '');
}

async function saveRates(rates: RateTable): Promise<void> {
  try {
    // Looking up an old expense mustn't replace newer rates kept for offline use.
    const saved = await readSavedRates(rates.base);
    if (saved && newestDate(saved) > newestDate(rates)) return;
    await AsyncStorage.setItem(cacheKey(rates.base), JSON.stringify(rates));
  } catch (error) {
    logger.warn('Could not save exchange rates', { error: String(error) });
  }
}

/** Shared by the form and the background refresh, so they don't repeat a request. */
const liveRatesQuery = (base: string, day: string) => ({
  queryKey: ['rates', base, day],
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const rates = await fetchRates(base, day, signal);
    await saveRates(rates);
    return rates;
  },
  // The sources are already a chain of retries.
  retry: false,
});

export type EntryRate =
  | { status: 'same' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; rate: number; rateDate: string; source: RateSource };

/** What one unit of `from` is worth in the table's base currency. */
export function rateIn(rates: RateTable | null | undefined, from: string) {
  const entry = rates?.rates[from];
  return entry && { rate: 1 / entry.rate, rateDate: entry.date };
}

/**
 * The rate for something paid in `from` on `day`, in `base`. A saved rate is usable straight away,
 * so a slow connection never holds up logging a cost.
 */
export function useEntryRate(base: string, from: string, day: string, enabled = true): EntryRate {
  const active = enabled && from !== base;
  const live = useQuery({ ...liveRatesQuery(base, day), enabled: active });
  const saved = useQuery({
    queryKey: ['rates-saved', base],
    queryFn: () => readSavedRates(base),
    enabled: active,
    staleTime: 0,
  });

  if (from === base) return { status: 'same' };
  const fresh = rateIn(live.data, from);
  if (fresh) return { status: 'ready', ...fresh, source: 'auto' };
  // The sources answered and don't know this currency: a saved table won't either.
  if (live.isSuccess) return { status: 'missing' };
  const fallback = rateIn(saved.data, from);
  if (fallback)
    return {
      status: 'ready',
      ...fallback,
      source: fallback.rateDate === day ? 'auto' : 'cached',
    };
  return live.isPending || saved.isPending ? { status: 'loading' } : { status: 'missing' };
}

/** Rates for a day, or undefined when offline. For background work that has no error to show. */
export async function lookUpRates(base: string, day: string): Promise<RateTable | undefined> {
  try {
    return await queryClient.fetchQuery(liveRatesQuery(base, day));
  } catch {
    return undefined;
  }
}
