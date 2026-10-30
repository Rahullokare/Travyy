import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { geocodePlace, placeQueries, type GeoHit } from './sources.ts';

const BRIDGE = {
  name: '25 de Abril Bridge',
  localName: 'Ponte 25 de Abril',
  city: 'Lisbon',
  country: 'Portugal',
};
const HIT: GeoHit = { lat: 38.69, lng: -9.18, address: 'Ponte 25 de Abril, Lisboa' };

function lookup(hits: Record<string, GeoHit>) {
  const queries: string[] = [];
  const fn = async (q: string) => (queries.push(q), hits[q]);
  return { queries, fn };
}

describe('placeQueries', () => {
  it('tries the name, then the local name, with the city and country', () => {
    assert.deepEqual(placeQueries(BRIDGE), [
      '25 de Abril Bridge, Lisbon, Portugal',
      'Ponte 25 de Abril, Lisbon, Portugal',
    ]);
  });

  it('skips a missing, blank or identical local name', () => {
    for (const localName of [null, undefined, '  ', 'cervejaria ramiro']) {
      assert.deepEqual(
        placeQueries({ name: 'Cervejaria Ramiro', localName, city: 'Lisbon', country: null }),
        ['Cervejaria Ramiro, Lisbon'],
      );
    }
  });
});

describe('geocodePlace', () => {
  it('searches the local name when the first name misses', async () => {
    const { queries, fn } = lookup({ 'Ponte 25 de Abril, Lisbon, Portugal': HIT });
    assert.equal(await geocodePlace(BRIDGE, { lookup: fn }), HIT);
    assert.equal(queries.length, 2);
  });

  it('stops at the first hit', async () => {
    const { queries, fn } = lookup({ '25 de Abril Bridge, Lisbon, Portugal': HIT });
    assert.equal(await geocodePlace(BRIDGE, { lookup: fn }), HIT);
    assert.equal(queries.length, 1);
  });

  it('makes only the first search when retries are off', async () => {
    const { queries, fn } = lookup({ 'Ponte 25 de Abril, Lisbon, Portugal': HIT });
    assert.equal(await geocodePlace(BRIDGE, { retry: false, lookup: fn }), undefined);
    assert.equal(queries.length, 1);
  });
});
