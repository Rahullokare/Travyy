import { describe, expect, it } from '@jest/globals';
import type { Place, Trip } from '@/domain/models';
import { tripAsText } from '../share';
import { decodeTrip, encodeTrip, tripShareUrl } from '../shareLink';

const place = (id: string, name: string, patch: Partial<Place> = {}): Place => ({
  id,
  name,
  city: 'Lisbon',
  country: 'Portugal',
  category: 'food',
  lat: 38.7069123,
  lng: -9.1459456,
  sourcePlatform: 'instagram',
  sourceUrl: 'https://instagram.com/reel/secret',
  note: 'private note',
  savedAt: 1,
  ...patch,
});

const places = [
  place('a', 'Pastéis de Belém', { category: 'cafe' }),
  place('b', '東寺 🏯', { category: 'sight', lat: 34.9806, lng: 135.7478 }),
  place('c', 'Park Bar', { category: 'nightlife' }),
];
const byId = new Map(places.map((p) => [p.id, p]));
const trip: Trip = {
  id: 't1',
  name: 'Lisbon with the gang',
  city: 'Lisbon',
  days: [
    { day: 1, placeIds: ['a', 'b'] },
    { day: 2, placeIds: ['c', 'gone'] },
  ],
  createdAt: 1,
};

describe('trip share links', () => {
  it('round-trips a trip, including accents, CJK and emoji', () => {
    const shared = decodeTrip(encodeTrip(trip, byId));
    expect(shared?.name).toBe('Lisbon with the gang');
    expect(shared?.city).toBe('Lisbon');
    expect(shared?.days.map((d) => d.map((p) => p.name))).toEqual([
      ['Pastéis de Belém', '東寺 🏯'],
      ['Park Bar'],
    ]);
    expect(shared?.days[0][0]).toMatchObject({
      category: 'cafe',
      lat: 38.70691,
      lng: -9.14595,
      country: 'Portugal',
    });
  });

  it('is URL-safe and leaves out notes and source links', () => {
    const encoded = encodeTrip(trip, byId);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const shared = JSON.stringify(decodeTrip(encoded));
    expect(shared).not.toContain('private note');
    expect(shared).not.toContain('instagram.com');
  });

  it('refuses anything that is not a trip', () => {
    expect(decodeTrip(undefined)).toBeUndefined();
    expect(decodeTrip('')).toBeUndefined();
    expect(decodeTrip('not base64 !!')).toBeUndefined();
    expect(decodeTrip('eyJ2IjoyfQ')).toBeUndefined(); // {"v":2}
    expect(decodeTrip(encodeTrip(trip, byId).slice(0, 40))).toBeUndefined();
  });

  it('refuses coordinates off the map', () => {
    const bad = encodeTrip(trip, new Map([['a', place('a', 'Nowhere', { lat: 123 })]]));
    expect(decodeTrip(bad)).toBeUndefined();
  });

  it('builds a link only when there is somewhere to host it', () => {
    expect(tripShareUrl(trip, byId, 'https://travyy.app')).toMatch(
      /^https:\/\/travyy\.app\/shared\?d=[\w-]+$/,
    );
    expect(tripShareUrl(trip, byId, undefined)).toBeUndefined();
  });

  it('puts the link in the shared text', () => {
    const text = tripAsText(trip, byId, 'https://travyy.app/shared?d=x');
    expect(text).toContain('2 days in Lisbon');
    expect(text).toContain('https://travyy.app/shared?d=x');
    expect(tripAsText(trip, byId)).not.toContain('See it on a map');
  });
});
