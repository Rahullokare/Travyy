import type { Place } from '@/domain/models';

export const UNKNOWN_CITY = 'Somewhere';

export function cityOf(p: Pick<Place, 'city'>): string {
  return p.city?.trim() || UNKNOWN_CITY;
}

/** Where a spot is, for a list row: its city, or its country when it has none (a whole country saved). */
export function areaOf(p: Pick<Place, 'city' | 'country'>): string {
  return p.city?.trim() || p.country?.trim() || UNKNOWN_CITY;
}

export interface CityGroup {
  city: string;
  country?: string;
  places: Place[];
  visited: number;
  /**
   * False for the "Somewhere" group of spots with no city. They can be anywhere in the world, so
   * the group is never a trip to plan, a city to count or a city chip on the map.
   */
  known: boolean;
}

/** Places grouped by city, biggest collections first, spots with no city last. */
export function groupByCity(places: Place[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const p of places) {
    const known = !!p.city?.trim();
    const key = known ? cityOf(p).toLowerCase() : '';
    const group = groups.get(key) ?? { city: cityOf(p), country: p.country, places: [], visited: 0, known };
    group.places.push(p);
    if (p.visitedAt) group.visited += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.known) - Number(a.known) || b.places.length - a.places.length,
  );
}

/** Real cities only, for planning, counting and the map's city chips. */
export function knownCities(places: Place[]): CityGroup[] {
  return groupByCity(places).filter((g) => g.known);
}

export function visitRate(places: Place[]): number {
  if (places.length === 0) return 0;
  return Math.round((places.filter((p) => p.visitedAt).length / places.length) * 100);
}
