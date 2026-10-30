import { Platform } from 'react-native';
import { z } from 'zod';
import type { Candidate, Category, LatLng } from '@/domain/models';
import { guessCategory } from '@/features/places/categories';
import { fetchWithTimeout } from '@/shared/lib/http';

/**
 * OpenStreetMap Nominatim: free, no key, CORS-enabled (works from web too).
 * Usage policy: max ~1 req/s and an identifying User-Agent. For production volume,
 * route through the backend or switch to a commercial geocoder behind the same API.
 */
const BASE = 'https://nominatim.openstreetmap.org';
// Browsers don't allow setting User-Agent and a custom header would force a CORS preflight.
const HEADERS: Record<string, string> =
  Platform.OS === 'web' ? {} : { 'User-Agent': 'Travyy/1.0 (travel saves app)' };

const HitSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
  type: z.string().optional(),
  category: z.string().optional(),
  addresstype: z.string().optional(),
  importance: z.coerce.number().optional(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      suburb: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});
type Hit = z.infer<typeof HitSchema>;

let lastRequestAt = 0;
async function politeGet(path: string, signal?: AbortSignal): Promise<unknown> {
  const wait = Math.max(0, lastRequestAt + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    headers: { ...HEADERS, 'Accept-Language': 'en' },
    signal,
  });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  return res.json();
}

const cityOf = (a: Hit['address']) => a?.city ?? a?.town ?? a?.village ?? a?.suburb;

function toCandidate(hit: Hit, confidence: number): Candidate {
  return {
    name: hit.display_name.split(',')[0].trim(),
    lat: hit.lat,
    lng: hit.lon,
    address: hit.display_name,
    city: cityOf(hit.address),
    country: hit.address?.country,
    category:
      categoryFromOsm(hit) ?? guessCategory(`${hit.display_name} ${hit.type ?? ''} ${hit.category ?? ''}`),
    confidence,
  };
}

const NATURE_TYPES =
  /^(island|islet|archipelago|national_park|nature_reserve|protected_area|beach|bay|peak|volcano|waterfall|park|garden|wood|cliff|cave_entrance)$/;
const SETTLEMENT_TYPES =
  /^(city|town|village|hamlet|suburb|quarter|neighbourhood|municipality|province|state|region|county|district|administrative)$/;

/** Category from OSM tags, when they say what the place is (an island is nature whatever the caption says next to it). */
export function categoryFromOsm(hit: Pick<Hit, 'category' | 'type' | 'addresstype'>): Category | undefined {
  const { category: cls, type } = hit;
  if (!cls || !type) return undefined;
  // An island is often tagged boundary/administrative, with `addresstype: island`.
  if (cls === 'natural' || NATURE_TYPES.test(type) || NATURE_TYPES.test(hit.addresstype ?? ''))
    return 'nature';
  if ((cls === 'place' || cls === 'boundary') && SETTLEMENT_TYPES.test(type)) return 'other';
  if (/^(restaurant|fast_food|food_court)$/.test(type)) return 'food';
  if (type === 'cafe') return 'cafe';
  if (/^(bar|pub|nightclub|biergarten)$/.test(type)) return 'nightlife';
  if (cls === 'tourism' && /^(hotel|hostel|guest_house|motel|chalet|apartment|camp_site)$/.test(type))
    return 'stay';
  if (/^(museum|attraction|viewpoint|place_of_worship|castle|monument|memorial|gallery|artwork)$/.test(type))
    return 'sight';
  if (cls === 'shop') return 'shopping';
  return undefined;
}

async function searchHits(
  query: string,
  options: { near?: LatLng; limit?: number; signal?: AbortSignal } = {},
): Promise<Hit[]> {
  const { near, limit = 8, signal } = options;
  const viewbox = near
    ? `&viewbox=${near.lng - 0.3},${near.lat + 0.3},${near.lng + 0.3},${near.lat - 0.3}`
    : '';
  const json = await politeGet(
    `/search?format=jsonv2&addressdetails=1&limit=${limit}${viewbox}&q=${encodeURIComponent(query)}`,
    signal,
  );
  return z.array(HitSchema).catch([]).parse(json);
}

export async function searchPlaces(
  query: string,
  options: { near?: LatLng; limit?: number; signal?: AbortSignal } = {},
): Promise<Candidate[]> {
  return (await searchHits(query, options)).map((h) => toCandidate(h, 0.9));
}

// Thai romanisation varies ("Koh Mak" in captions, "Ko Mak" in OSM), and islands are a staple of travel reels.
const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bkoh\b/g, 'ko')
    .replace(/\s+/g, ' ')
    .trim();
const hitName = (hit: Hit) => hit.display_name.split(',')[0];
const isArea = (hit: Hit) =>
  hit.category === 'place' || hit.category === 'boundary' || hit.category === 'natural';

/**
 * Best of a few geocoder hits for a caption name. Nominatim's first hit is often a business
 * that merely contains the name ("Koh Mak BuriHut" for the island Koh Mak), so prefer an exact
 * name match, then a whole area over a venue, and never a road.
 */
export function pickBestHit(hits: Hit[], name: string): Hit | undefined {
  const wanted = normalizeName(name);
  const score = (hit: Hit) => {
    const same = normalizeName(hitName(hit)) === wanted;
    return (
      (hit.importance ?? 0) +
      (same ? 1 : 0) +
      (same && isArea(hit) ? 1 : 0) -
      (hit.category === 'highway' ? 2 : 0)
    );
  };
  let best: Hit | undefined;
  for (const hit of hits) if (!best || score(hit) > score(best)) best = hit;
  return best;
}

/** "Koh Mak" ↔ "Ko Mak": the spelling OSM may use instead. */
function spellingVariants(name: string): string[] {
  if (/\bKoh\b/i.test(name)) return [name.replace(/\bKoh\b/gi, 'Ko')];
  if (/\bKo\b/i.test(name)) return [name.replace(/\bKo\b/gi, 'Koh')];
  return [];
}

async function geocodeName(
  name: string,
  context: (string | undefined)[],
  signal?: AbortSignal,
): Promise<Hit | undefined> {
  const query = (n: string) => [n, ...context].filter(Boolean).join(', ');
  const best = pickBestHit(await searchHits(query(name), { limit: 5, signal }), name);
  if (best && (isArea(best) || normalizeName(hitName(best)) === normalizeName(name))) return best;
  for (const variant of spellingVariants(name)) {
    const alt = pickBestHit(await searchHits(query(variant), { limit: 5, signal }), variant);
    if (alt && isArea(alt)) return alt;
  }
  return best;
}

export async function reverseGeocode(point: LatLng, signal?: AbortSignal) {
  try {
    const hit = HitSchema.parse(
      await politeGet(`/reverse?format=jsonv2&addressdetails=1&lat=${point.lat}&lon=${point.lng}`, signal),
    );
    return { city: cityOf(hit.address), country: hit.address?.country, address: hit.display_name };
  } catch {
    return undefined;
  }
}

/** Pin every candidate that lacks coordinates. Unresolvable ones are kept (flagged) so the user can fix them. */
export async function geocodeCandidates(
  candidates: Candidate[],
  options: { cityHint?: string; signal?: AbortSignal } = {},
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (c.lat !== undefined && c.lng !== undefined) {
      out.push(c);
      continue;
    }
    try {
      const hit = await geocodeName(c.name, [c.city ?? options.cityHint, c.country], options.signal);
      if (hit) {
        const found = toCandidate(hit, c.confidence);
        out.push({
          ...c,
          lat: found.lat,
          lng: found.lng,
          address: found.address,
          city: c.city ?? found.city ?? options.cityHint,
          country: c.country ?? found.country,
          // A name that says what it is ("Railay Beach") wins; otherwise trust OSM over the caption text around it.
          category: guessCategory(c.name) === 'other' ? (categoryFromOsm(hit) ?? c.category) : c.category,
        });
        continue;
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
    }
    out.push({ ...c, city: c.city ?? options.cityHint, confidence: c.confidence * 0.5 });
  }
  return out;
}
