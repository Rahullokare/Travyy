import type { Place } from '@/domain/models';

export const UNKNOWN_CITY = 'Somewhere';

export function cityOf(p: Pick<Place, 'city'>): string {
  return p.city?.trim() || UNKNOWN_CITY;
}

export interface CityGroup {
  city: string;
  country?: string;
  places: Place[];
  visited: number;
}

/** Places grouped by city, biggest collections first. */
export function groupByCity(places: Place[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const p of places) {
    const key = cityOf(p).toLowerCase();
    const group = groups.get(key) ?? { city: cityOf(p), country: p.country, places: [], visited: 0 };
    group.places.push(p);
    if (p.visitedAt) group.visited += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.places.length - a.places.length);
}

export function visitRate(places: Place[]): number {
  if (places.length === 0) return 0;
  return Math.round((places.filter((p) => p.visitedAt).length / places.length) * 100);
}
