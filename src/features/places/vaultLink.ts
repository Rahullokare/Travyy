import { z } from 'zod';
import { CATEGORIES, type NewPlace, type Place } from '@/domain/models';
import { webBase } from '@/features/trips/shareLink';
import { fromLinkData, toLinkData } from '@/shared/lib/linkData';

/**
 * A vault in a link: a copy of its spots at the moment it was shared, opened on a map in any
 * browser, with one button to add it to your own Travyy (glide's "steal good taste"). Like a trip
 * link (ARCHITECTURE 20) it needs no account and no server. Live vaults with friends are
 * `sharedVaults.ts`.
 *
 * Wire format, version 1: base64url of UTF-8 JSON
 *   { v: 1, n: name, e?: emoji, c: [city, country?, countryCode?][], p: [[name, lat, lng, categoryIndex, cityIndex], …] }
 * Cities are listed once and referenced by index, which keeps 50 spots in one city to about 2 KB.
 * Notes, source links and visited marks stay private.
 */
export const MAX_LINK_SPOTS = 150;

const WireSpot = z.tuple([
  z.string().min(1).max(120),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z
    .number()
    .int()
    .min(0)
    .max(CATEGORIES.length - 1),
  z.number().int().min(-1).max(200),
]);
const WireCity = z.tuple([z.string().max(120), z.string().max(120).optional(), z.string().max(2).optional()]);
const WireVault = z.object({
  v: z.literal(1),
  n: z.string().min(1).max(60),
  e: z.string().max(16).optional(),
  c: z.array(WireCity).max(200),
  p: z.array(WireSpot).min(1).max(MAX_LINK_SPOTS),
});

export interface SharedVaultLink {
  name: string;
  emoji?: string;
  places: NewPlace[];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function encodeVault(vault: { name: string; emoji?: string }, places: Place[]): string {
  const cities: z.infer<typeof WireCity>[] = [];
  const cityIndex = new Map<string, number>();
  const spots = places.slice(0, MAX_LINK_SPOTS).map((p): z.infer<typeof WireSpot> => {
    let index = -1;
    const city = p.city?.trim();
    if (city) {
      const key = `${city.toLowerCase()}|${p.countryCode ?? p.country ?? ''}`;
      if (!cityIndex.has(key)) {
        cityIndex.set(key, cities.length);
        cities.push(
          p.countryCode ? [city, p.country, p.countryCode] : p.country ? [city, p.country] : [city],
        );
      }
      index = cityIndex.get(key)!;
    }
    return [p.name.slice(0, 120), round5(p.lat), round5(p.lng), CATEGORIES.indexOf(p.category), index];
  });
  return toLinkData({ v: 1, n: vault.name, ...(vault.emoji ? { e: vault.emoji } : {}), c: cities, p: spots });
}

/** A link is untrusted input: anything that doesn't match the format exactly is refused. */
export function decodeVault(encoded: string | undefined): SharedVaultLink | undefined {
  if (!encoded) return undefined;
  try {
    const wire = WireVault.parse(fromLinkData(encoded));
    return {
      name: wire.n,
      emoji: wire.e,
      places: wire.p.map(([name, lat, lng, category, city]) => {
        const [cityName, country, countryCode] = wire.c[city] ?? [];
        return {
          name,
          lat,
          lng,
          category: CATEGORIES[category],
          city: cityName || undefined,
          country,
          countryCode: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : undefined,
          sourcePlatform: 'manual',
        };
      }),
    };
  } catch {
    return undefined;
  }
}

/** Undefined when there's nowhere to host the link; callers then share plain text. */
export function vaultShareUrl(
  vault: { name: string; emoji?: string },
  places: Place[],
  base = webBase(),
): string | undefined {
  if (!base || places.length === 0) return undefined;
  return `${base}/shared-vault?d=${encodeVault(vault, places)}`;
}

/** What goes in the share sheet: a line about the vault, then the link or, without one, the spots. */
export function vaultShareText(
  vault: { name: string; emoji?: string },
  places: Place[],
  url: string | undefined,
): string {
  const cities = [...new Set(places.map((p) => p.city?.trim()).filter(Boolean))];
  const head = `${vault.emoji ? `${vault.emoji} ` : ''}${vault.name}: ${places.length} spot${places.length === 1 ? '' : 's'}${cities.length ? ` in ${cities.slice(0, 3).join(', ')}` : ''}`;
  if (url) return `${head}\n${url}`;
  return [head, ...places.map((p) => `• ${p.name}${p.city ? `, ${p.city}` : ''}`)].join('\n');
}
