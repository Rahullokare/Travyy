import { describe, expect, it } from '@jest/globals';
import {
  convertMinor,
  defaultCurrency,
  formatRate,
  impliedRate,
  formatMoney,
  MAX_AMOUNT_MINOR,
  minorDigits,
  minorToInput,
  parseAmount,
} from '@/domain/money';

describe('minorDigits', () => {
  it('knows the ISO exceptions', () => {
    expect(minorDigits('INR')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('VND')).toBe(0);
    expect(minorDigits('KWD')).toBe(3);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1200', 'INR', 120000],
    ['1200.5', 'INR', 120050],
    ['1200.50', 'INR', 120050],
    ['1,200.50', 'INR', 120050],
    ['1.200,50', 'EUR', 120050],
    ['1200,5', 'EUR', 120050],
    ['1,200', 'INR', 120000],
    ['1,00,000', 'INR', 10000000],
    ['1.000.000', 'IDR', 100000000],
    ['0.01', 'USD', 1],
    ['1.15', 'USD', 115],
    ['2400', 'JPY', 2400],
    ['1,200', 'JPY', 1200],
    ['1.234', 'KWD', 1234],
    [' 45 ', 'THB', 4500],
  ])('reads %s %s as %i', (text, currency, minor) => {
    expect(parseAmount(text, currency)).toBe(minor);
  });

  it.each(['', 'abc', '-5', '1.2x', '.5', '1.5555'])('rejects %j', (text) => {
    expect(parseAmount(text, 'USD')).toBeUndefined();
  });

  it('rejects decimals a currency does not have', () => {
    expect(parseAmount('12.5', 'JPY')).toBeUndefined();
  });

  it('rejects amounts past the limit that keeps the maths exact', () => {
    expect(parseAmount(String(MAX_AMOUNT_MINOR / 100), 'INR')).toBe(MAX_AMOUNT_MINOR);
    expect(parseAmount(String(MAX_AMOUNT_MINOR), 'INR')).toBeUndefined();
  });
});

describe('formatMoney', () => {
  it('drops decimals only on whole amounts', () => {
    expect(formatMoney(120000, 'USD', 'en-US')).toBe('$1,200');
    expect(formatMoney(120050, 'USD', 'en-US')).toBe('$1,200.50');
    expect(formatMoney(2400, 'JPY', 'en-US')).toBe('¥2,400');
  });

  it('falls back to the code for a currency Intl rejects', () => {
    expect(formatMoney(150, 'not-a-code', 'en-US')).toBe('not-a-code 1.50');
  });
});

describe('minorToInput', () => {
  it('round-trips through parseAmount', () => {
    for (const [minor, currency] of [
      [120050, 'INR'],
      [120000, 'INR'],
      [2400, 'JPY'],
      [1234, 'KWD'],
    ] as const) {
      expect(parseAmount(minorToInput(minor, currency), currency)).toBe(minor);
    }
  });
});

describe('defaultCurrency', () => {
  it('uses the region of the locale', () => {
    expect(defaultCurrency('en-IN')).toBe('INR');
    expect(defaultCurrency('pt-BR')).toBe('BRL');
    expect(defaultCurrency('zh-Hant-HK')).toBe('HKD');
  });

  it('falls back to USD', () => {
    expect(defaultCurrency('en')).toBe('USD');
    expect(defaultCurrency('xx-ZZ')).toBe('USD');
  });
});

describe('conversion', () => {
  it('converts between currencies with different decimals', () => {
    expect(convertMinor(90000, 'THB', 'INR', 2.5)).toBe(225000);
    expect(convertMinor(1000, 'JPY', 'INR', 0.6)).toBe(60000);
    expect(convertMinor(10000, 'INR', 'JPY', 1.65)).toBe(165);
    expect(convertMinor(1000, 'KWD', 'USD', 3.25)).toBe(325);
  });

  it('works out the rate from what the bank charged', () => {
    expect(impliedRate(90000, 'THB', 253000, 'INR')).toBeCloseTo(2.8111, 3);
    expect(impliedRate(1000, 'JPY', 60000, 'INR')).toBeCloseTo(0.6, 6);
    const rate = impliedRate(90000, 'THB', 253000, 'INR');
    expect(convertMinor(90000, 'THB', 'INR', rate)).toBe(253000);
  });

  it('words a rate', () => {
    expect(formatRate(2.82449, 'THB', 'INR', 'en-US')).toBe('1 THB = 2.824 INR');
    expect(formatRate(0.003383, 'VND', 'INR', 'en-US')).toBe('1 VND = 0.003383 INR');
  });
});
