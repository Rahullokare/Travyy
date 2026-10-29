import { Platform } from 'react-native';
import { z } from 'zod';
import type { Candidate, LatLng } from '@/domain/models';
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
    category: guessCategory(`${hit.display_name} ${hit.type ?? ''} ${hit.category ?? ''}`),
    confidence,
  };
}

export async function searchPlaces(
  query: string,
  options: { near?: LatLng; limit?: number; signal?: AbortSignal } = {},
): Promise<Candidate[]> {
  const { near, limit = 8, signal } = options;
  const viewbox = near
    ? `&viewbox=${near.lng - 0.3},${near.lat + 0.3},${near.lng + 0.3},${near.lat - 0.3}`
    : '';
  const json = await politeGet(
    `/search?format=jsonv2&addressdetails=1&limit=${limit}${viewbox}&q=${encodeURIComponent(query)}`,
    signal,
  );
  return z
    .array(HitSchema)
    .catch([])
    .parse(json)
    .map((h) => toCandidate(h, 0.9));
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
    const query = [c.name, c.city ?? options.cityHint, c.country].filter(Boolean).join(', ');
    try {
      const [hit] = await searchPlaces(query, { limit: 1, signal: options.signal });
      if (hit) {
        out.push({
          ...c,
          lat: hit.lat,
          lng: hit.lng,
          address: hit.address,
          city: c.city ?? hit.city ?? options.cityHint,
          country: c.country ?? hit.country,
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
