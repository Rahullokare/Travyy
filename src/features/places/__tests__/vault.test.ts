import { describe, expect, it } from '@jest/globals';
import type { Place } from '@/domain/models';
import {
  categoryCounts,
  groupByCountry,
  placesInCity,
  placesInCountry,
  searchSaves,
  UNKNOWN_COUNTRY,
} from '../vault';

let n = 0;
const place = (name: string, city?: string, country?: string, patch: Partial<Place> = {}): Place => ({
  id: `p${++n}`,
  name,
  city,
  country,
  category: 'food',
  lat: 0,
  lng: 0,
  sourcePlatform: 'manual',
  savedAt: n,
  ...patch,
});

const places = [
  place('Pastéis de Belém', 'Lisbon', 'Portugal', { category: 'cafe' }),
  place('Time Out Market', 'Lisbon', 'Portugal', { visitedAt: 5 }),
  place('Livraria Lello', 'Porto', 'Portugal', { category: 'shopping', note: 'Harry Potter bookshop' }),
  place('Fushimi Inari', 'Kyoto', 'Japan', { category: 'sight' }),
  place('Ichiran', 'Tokyo', 'japan '),
  place('Mystery spot'),
  place('Springfield Diner', 'Springfield', 'USA'),
  place('Springfield Pub', 'Springfield', 'Australia'),
];

describe('groupByCountry', () => {
  const groups = groupByCountry(places);

  it('nests cities under countries, biggest first, unsorted last', () => {
    expect(groups.map((g) => g.country)).toEqual([
      'Portugal',
      'Japan',
      'Australia',
      'United States',
      UNKNOWN_COUNTRY,
    ]);
    expect(groups.map((g) => g.code)).toEqual(['PT', 'JP', 'AU', 'US', undefined]);
    expect(groups[0].cities.map((c) => [c.city, c.places.length])).toEqual([
      ['Lisbon', 2],
      ['Porto', 1],
    ]);
    expect(groups[0]).toMatchObject({ spots: 3, visited: 1 });
  });

  it('treats differently-cased country names as one', () => {
    expect(groups[1].cities.map((c) => c.city).sort()).toEqual(['Kyoto', 'Tokyo']);
  });

  it('puts one country in one folder whatever it was called when saved', () => {
    const mixed = groupByCountry([
      place('A', 'New York', 'USA'),
      place('B', 'Austin', 'United States'),
      place('C', 'Tokyo', '日本', { countryCode: 'JP' }),
      place('D', 'Kyoto', 'Japan'),
      place('E', 'Atlantis', 'Narnia'),
    ]);
    expect(mixed.map((g) => [g.country, g.spots])).toEqual([
      ['Japan', 2],
      ['United States', 2],
      ['Narnia', 1],
    ]);
    expect(placesInCountry([place('F', 'Leeds', 'England')], 'UK')).toHaveLength(1);
  });

  it('keeps same-named cities in different countries apart', () => {
    expect(placesInCity(places, 'United States', 'Springfield').map((p) => p.name)).toEqual([
      'Springfield Diner',
    ]);
    expect(placesInCountry(places, 'japan')).toHaveLength(2);
    expect(placesInCountry(places, UNKNOWN_COUNTRY).map((p) => p.name)).toEqual(['Mystery spot']);
  });
});

describe('searchSaves', () => {
  const names = (q: string) => searchSaves(places, q, (c) => (c === 'cafe' ? 'Café' : c)).map((p) => p.name);

  it('ignores accents and case', () => {
    expect(names('pasteis')).toEqual(['Pastéis de Belém']);
    expect(names('BELEM')).toEqual(['Pastéis de Belém']);
  });

  it('matches words in any order across name, city, country, note and category', () => {
    expect(names('cafe lisbon')).toEqual(['Pastéis de Belém']);
    expect(names('potter')).toEqual(['Livraria Lello']);
    expect(names('japan')).toHaveLength(2);
    expect(names('lisbon tokyo')).toEqual([]);
  });

  it('puts name matches before city matches', () => {
    expect(names('springfield')).toHaveLength(2);
    const mixed = searchSaves(
      [place('Hotel', 'Porto', 'Portugal'), place('Porto Tónico', 'Lisbon', 'Portugal')],
      'porto',
    );
    expect(mixed.map((p) => p.name)).toEqual(['Porto Tónico', 'Hotel']);
  });

  it('returns everything for an empty search', () => {
    expect(names('  ')).toHaveLength(places.length);
  });
});

describe('categoryCounts', () => {
  it('counts categories, most used first', () => {
    expect(categoryCounts(places)[0]).toEqual(['food', 5]);
  });
});
