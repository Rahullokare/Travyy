import { countryCodeOf, countryName } from '@/domain/countries';
import type { Category, Place } from '@/domain/models';
import { cityOf, groupByCity, type CityGroup } from '@/store';

/**
 * The saves vault: country → city → spots. A flat list stops working at about fifty saves, so the
 * Saves tab shows a handful of countries, each opens to its cities, and each city to its spots.
 * Search cuts across all of it.
 */
export const UNKNOWN_COUNTRY = 'Not sorted yet';

type HasCountry = Pick<Place, 'country' | 'countryCode'>;

/**
 * Saves made before codes were stored, and names the geocoder never saw, are looked up by name
 * here, so they land in the same folder without rewriting anything on the phone.
 */
export function countryCodeFor(p: HasCountry): string | undefined {
  return p.countryCode ?? countryCodeOf(p.country);
}

/** The folder a spot belongs to: the country's usual English name when it's recognised. */
export function countryOf(p: HasCountry): string {
  return countryName(countryCodeFor(p)) ?? (p.country?.trim() || UNKNOWN_COUNTRY);
}

export interface CountryGroup {
  country: string;
  /** ISO code, when the country is recognised. */
  code?: string;
  cities: CityGroup[];
  spots: number;
  visited: number;
  /** Most recent save, so a country you just added to is easy to spot. */
  lastSavedAt: number;
}

/** Countries with the most saves first; spots without a country go last. */
export function groupByCountry(places: Place[]): CountryGroup[] {
  const byCountry = new Map<string, Place[]>();
  for (const p of places) {
    const key = countryOf(p).toLowerCase();
    byCountry.set(key, [...(byCountry.get(key) ?? []), p]);
  }
  return [...byCountry.values()]
    .map((group): CountryGroup => ({
      country: countryOf(group[0]),
      code: countryCodeFor(group[0]),
      cities: groupByCity(group),
      spots: group.length,
      visited: group.filter((p) => p.visitedAt).length,
      lastSavedAt: Math.max(...group.map((p) => p.savedAt)),
    }))
    .sort(
      (a, b) =>
        Number(a.country === UNKNOWN_COUNTRY) - Number(b.country === UNKNOWN_COUNTRY) ||
        b.spots - a.spots ||
        a.country.localeCompare(b.country),
    );
}

const sameName = (a: string, b: string | undefined) => a.toLowerCase() === (b ?? '').trim().toLowerCase();

/** `country` is a folder name, or anything else the country is called ("USA"). */
export function placesInCountry(places: Place[], country: string): Place[] {
  const folder = countryName(countryCodeOf(country)) ?? country;
  return places.filter((p) => sameName(countryOf(p), folder));
}

export function placesInCity(places: Place[], country: string, city: string): Place[] {
  return placesInCountry(places, country).filter((p) => sameName(cityOf(p), city));
}

/** Lower-case and without accents, so "pasteis" finds "Pastéis" and "sao" finds "São". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Every word of the query has to appear somewhere in the spot (name, city, country, note or
 * category), in any order: "lisbon cafe" and "cafe lisbon" both work. Spots whose name matches
 * come first, a name that starts with the query before that.
 */
export function searchSaves(
  places: Place[],
  query: string,
  categoryLabel: (c: Category) => string = (c) => c,
): Place[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return places;
  const whole = words.join(' ');
  const scored: { place: Place; score: number }[] = [];
  for (const place of places) {
    const name = fold(place.name);
    const rest = fold(
      [place.city, place.country, countryOf(place), place.note, categoryLabel(place.category)].join(' '),
    );
    if (!words.every((w) => name.includes(w) || rest.includes(w))) continue;
    const score = name.startsWith(whole) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
    scored.push({ place, score });
  }
  return scored.sort((a, b) => a.score - b.score || b.place.savedAt - a.place.savedAt).map((s) => s.place);
}

/** Categories present in these places, most used first, with how many spots each has. */
export function categoryCounts(places: Place[]): [Category, number][] {
  const counts = new Map<Category, number>();
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
