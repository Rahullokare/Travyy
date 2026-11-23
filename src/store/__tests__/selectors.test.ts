import { describe, expect, it } from '@jest/globals';
import type { Place } from '@/domain/models';
import { areaOf, groupByCity, knownCities } from '@/store';

const place = (name: string, city?: string, country?: string): Place =>
  ({
    id: name,
    name,
    city,
    country,
    lat: 0,
    lng: 0,
    category: 'sight',
    sourcePlatform: 'manual',
    savedAt: 0,
  }) as Place;

const places = [
  place('Iceland', undefined, 'Iceland'),
  place('Morocco', undefined, 'Morocco'),
  place('Jordan', '  ', 'Jordan'),
  place('Belém Tower', 'Lisbon', 'Portugal'),
  place('Time Out Market', 'Lisbon', 'Portugal'),
  place('Fushimi Inari', 'Kyoto', 'Japan'),
];

describe('spots without a city', () => {
  it('group together and sort after every real city, however many there are', () => {
    expect(groupByCity(places).map((g) => [g.city, g.places.length, g.known])).toEqual([
      ['Lisbon', 2, true],
      ['Kyoto', 1, true],
      ['Somewhere', 3, false],
    ]);
  });

  it('are never a city to plan, count or filter the map by', () => {
    expect(knownCities(places).map((g) => g.city)).toEqual(['Lisbon', 'Kyoto']);
  });

  it('show their country in a list instead of "Somewhere"', () => {
    expect(places.map(areaOf)).toEqual(['Iceland', 'Morocco', 'Jordan', 'Lisbon', 'Lisbon', 'Kyoto']);
    expect(areaOf({ city: undefined, country: undefined })).toBe('Somewhere');
  });
});
