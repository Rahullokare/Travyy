import { beforeEach, describe, expect, it } from '@jest/globals';
import type { NewPlace } from '@/domain/models';
import { groupByCity, sanitize, useAppStore, visitRate } from '@/store';

const place = (name: string, lat: number, lng: number, city = 'Lisbon'): NewPlace => ({
  name,
  lat,
  lng,
  city,
  category: 'food',
  sourcePlatform: 'manual',
});

beforeEach(() => {
  useAppStore.getState().reset();
});

describe('addPlaces', () => {
  it('assigns ids and timestamps', () => {
    const [id] = useAppStore.getState().addPlaces([place('Time Out Market', 38.7069, -9.1459)]);
    const saved = useAppStore.getState().places[0];
    expect(saved.id).toBe(id);
    expect(saved.savedAt).toBeGreaterThan(0);
  });

  it('dedupes the same place saved twice, including within one batch', () => {
    const store = useAppStore.getState();
    const first = store.addPlaces([place('Ramiro', 38.7206, -9.1357), place('ramiro ', 38.72061, -9.13571)]);
    const again = useAppStore.getState().addPlaces([place('Ramiro', 38.7207, -9.1358)]);
    expect(useAppStore.getState().places).toHaveLength(1);
    expect(new Set([...first, ...again]).size).toBe(1);
  });

  it('keeps same-named places in different locations', () => {
    useAppStore
      .getState()
      .addPlaces([place('Starbucks', 38.7, -9.1), place('Starbucks', 35.0, 135.7, 'Kyoto')]);
    expect(useAppStore.getState().places).toHaveLength(2);
  });
});

describe('trips', () => {
  it('creates a planned trip and removes deleted places from it', () => {
    const ids = useAppStore
      .getState()
      .addPlaces([
        place('A', 38.7, -9.2),
        place('B', 38.71, -9.19),
        place('C', 38.72, -9.13),
        place('D', 38.72, -9.12),
      ]);
    const tripId = useAppStore
      .getState()
      .createTrip({ name: 'Lisbon', city: 'Lisbon', placeIds: ids, days: 2 });
    const trip = () => useAppStore.getState().trips.find((t) => t.id === tripId)!;
    expect(
      trip()
        .days.flatMap((d) => d.placeIds)
        .sort(),
    ).toEqual([...ids].sort());

    useAppStore.getState().removePlace(ids[0]);
    expect(trip().days.flatMap((d) => d.placeIds)).not.toContain(ids[0]);
  });
});

describe('toggleVisited + selectors', () => {
  it('tracks visits and computes the visit rate', () => {
    const [a] = useAppStore.getState().addPlaces([place('A', 1, 1), place('B', 2, 2, 'Kyoto')]);
    useAppStore.getState().toggleVisited(a);
    const { places } = useAppStore.getState();
    expect(visitRate(places)).toBe(50);
    expect(groupByCity(places).map((g) => [g.city, g.visited])).toEqual(
      expect.arrayContaining([
        ['Lisbon', 1],
        ['Kyoto', 0],
      ]),
    );
    useAppStore.getState().toggleVisited(a);
    expect(visitRate(useAppStore.getState().places)).toBe(0);
  });
});

describe('sanitize (persisted state validation)', () => {
  it('drops corrupt records instead of crashing', () => {
    const valid = { ...place('Ok', 1, 1), id: 'x', savedAt: 1 };
    const result = sanitize({
      places: [valid, { name: 'no coords' }, { ...valid, id: 'y', lat: 999 }, null],
      trips: 'not an array',
      onboarded: true,
      isPro: 'yes',
    });
    expect(result.places).toEqual([valid]);
    expect(result.trips).toEqual([]);
    expect(result.onboarded).toBe(true);
    expect(result.isPro).toBe(false);
  });

  it('handles empty or garbage storage', () => {
    expect(sanitize(undefined)).toEqual({});
    expect(sanitize('garbage')).toEqual({});
  });
});
