import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchRates, lookUpRates, rateIn, readSavedRates } from '../api/rates';
import { localDay } from '../dates';
import { queryClient } from '@/shared/query/queryClient';

type FetchMock = jest.MockedFunction<typeof fetch>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: FetchMock;
beforeEach(async () => {
  fetchMock = jest.fn() as FetchMock;
  globalThis.fetch = fetchMock;
  await AsyncStorage.clear();
  queryClient.clear();
});

const frankfurter = [
  { date: '2026-10-30', base: 'INR', quote: 'THB', rate: 0.354 },
  { date: '2026-10-29', base: 'INR', quote: 'USD', rate: 0.0105 },
  { date: '2026-10-30', base: 'INR', quote: 'BTCX', rate: 0.1 },
  { date: '2026-10-30', base: 'INR', quote: 'BAD', rate: 0 },
];
const currencyApi = { date: '2026-10-30', inr: { thb: 0.355, '1inch': 0.13, usd: 0.0106, zero: 0 } };

describe('fetchRates', () => {
  it('reads Frankfurter, keeping each currency’s own date and dropping unusable rows', async () => {
    fetchMock.mockResolvedValueOnce(json(frankfurter));
    const table = await fetchRates('INR', '2026-10-30');
    expect(String(fetchMock.mock.calls[0][0])).toContain('date=2026-10-30&base=INR');
    expect(table.rates).toEqual({
      THB: { rate: 0.354, date: '2026-10-30' },
      USD: { rate: 0.0105, date: '2026-10-29' },
    });
  });

  it('falls back to the currency API for that date when Frankfurter is down', async () => {
    fetchMock.mockResolvedValueOnce(new Response('error code: 522', { status: 522 }));
    fetchMock.mockResolvedValueOnce(json(currencyApi));
    const table = await fetchRates('INR', '2026-10-30');
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'currency-api@2026-10-30/v1/currencies/inr.min.json',
    );
    expect(table.rates).toEqual({
      THB: { rate: 0.355, date: '2026-10-30' },
      USD: { rate: 0.0106, date: '2026-10-30' },
    });
  });

  it('falls back to the latest rates when nothing has that date, as Frankfurter does for today', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    fetchMock.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    fetchMock.mockResolvedValueOnce(json(currencyApi));
    await fetchRates('INR', '2026-11-06');
    expect(String(fetchMock.mock.calls[2][0])).toContain('currency-api@latest');
  });

  it('survives an answer in the wrong shape', async () => {
    fetchMock.mockResolvedValueOnce(json({ surprise: true }));
    fetchMock.mockResolvedValueOnce(json({ date: '2026-10-30' }));
    fetchMock.mockResolvedValueOnce(json(currencyApi));
    const table = await fetchRates('INR', '2026-10-30');
    expect(table.rates.THB.rate).toBe(0.355);
  });

  it('asks for today instead of a future date', async () => {
    fetchMock.mockResolvedValueOnce(json(frankfurter));
    await fetchRates('INR', '2099-01-01');
    expect(String(fetchMock.mock.calls[0][0])).toContain(`date=${localDay()}&`);
  });

  it('throws when every source fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network failed'));
    await expect(fetchRates('INR', '2026-10-30')).rejects.toThrow('Network failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('rateIn', () => {
  it('turns a table for the trip currency into the rate for what was paid', () => {
    const table = { base: 'INR', rates: { THB: { rate: 0.4, date: '2026-10-30' } } };
    expect(rateIn(table, 'THB')).toEqual({ rate: 2.5, rateDate: '2026-10-30' });
    expect(rateIn(table, 'XYZ')).toBeUndefined();
    expect(rateIn(undefined, 'THB')).toBeUndefined();
  });
});

describe('saved rates', () => {
  it('keeps the table for offline use', async () => {
    fetchMock.mockResolvedValueOnce(json(frankfurter));
    await lookUpRates('INR', '2026-10-30');
    expect((await readSavedRates('INR'))?.rates.THB.rate).toBe(0.354);
  });

  it('isn’t replaced by rates for an older date', async () => {
    fetchMock.mockResolvedValueOnce(json(frankfurter));
    await lookUpRates('INR', '2026-10-30');
    fetchMock.mockResolvedValueOnce(json([{ date: '2026-01-05', base: 'INR', quote: 'THB', rate: 0.5 }]));
    await lookUpRates('INR', '2026-01-05');
    expect((await readSavedRates('INR'))?.rates.THB.rate).toBe(0.354);
  });

  it('reports nothing when offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network failed'));
    await expect(lookUpRates('INR', '2026-10-30')).resolves.toBeUndefined();
  });

  it('ignores corrupt storage', async () => {
    await AsyncStorage.setItem('travyy-rates-v1-INR', '{"nope":');
    await expect(readSavedRates('INR')).resolves.toBeNull();
    await AsyncStorage.setItem(
      'travyy-rates-v1-INR',
      '{"base":"INR","rates":{"THB":{"rate":-1,"date":"x"}}}',
    );
    await expect(readSavedRates('INR')).resolves.toBeNull();
  });
});
