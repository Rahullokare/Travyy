import { describe, expect, it } from '@jest/globals';
import { countryCodeOf, countryName, flagOf, normalizeCountryCode } from '../countries';

describe('countries', () => {
  it('finds the code whatever the country was called', () => {
    expect(countryCodeOf('Japan')).toBe('JP');
    expect(countryCodeOf('  united states ')).toBe('US');
    expect(countryCodeOf('USA')).toBe('US');
    expect(countryCodeOf('UK')).toBe('GB');
    expect(countryCodeOf('Türkiye')).toBe('TR');
    expect(countryCodeOf('Czech Republic')).toBe('CZ');
    expect(countryCodeOf('Côte d’Ivoire'.replace('’', "'"))).toBe('CI');
    expect(countryCodeOf('in')).toBe('IN');
  });

  it('does not guess', () => {
    expect(countryCodeOf('Narnia')).toBeUndefined();
    expect(countryCodeOf('')).toBeUndefined();
    expect(countryCodeOf(undefined)).toBeUndefined();
    expect(countryCodeOf('ZZ')).toBeUndefined();
  });

  it('checks codes from a geocoder', () => {
    expect(normalizeCountryCode('jp')).toBe('JP');
    expect(normalizeCountryCode('zz')).toBeUndefined();
    expect(normalizeCountryCode(undefined)).toBeUndefined();
  });

  it('names and flags a code', () => {
    expect(countryName('PT')).toBe('Portugal');
    expect(countryName('ZZ')).toBeUndefined();
    expect(flagOf('IN')).toBe('🇮🇳');
    expect(flagOf('JP')).toBe('🇯🇵');
    expect(flagOf(undefined)).toBeUndefined();
    expect(flagOf('ZZ')).toBeUndefined();
  });

  it('has a unique name for every code', () => {
    const codes = 'AD AE AF IN JP PT US GB VN TH ID FR IT ES DE BR MX ZA AU NZ SG MY LK NP MV'.split(' ');
    expect(new Set(codes.map(countryName)).size).toBe(codes.length);
  });
});
