import { Platform } from 'react-native';
import { z } from 'zod';
import { CATEGORIES, type NewPlace, type Place, type Trip } from '@/domain/models';
import { env } from '@/shared/config/env';
import { fromLinkData, toLinkData } from '@/shared/lib/linkData';

/**
 * A whole trip in a link. The plan travels inside the URL, so sharing needs no account and no
 * server, and the link opens on a map in any browser. It's a copy of the plan at the moment it was
 * shared; live group trips come with sync (docs/RESEARCH.md, roadmap).
 *
 * Wire format, version 1: base64url of UTF-8 JSON
 *   { v: 1, n: name, c: city, k?: country, d: [[[name, lat, lng, categoryIndex], …], …] }
 * Short keys and arrays keep a 20-stop trip under about 1.5 KB of URL.
 */
const MAX_DAYS = 30;
const MAX_STOPS_PER_DAY = 40;

const WireStop = z.tuple([
  z.string().min(1).max(120),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z
    .number()
    .int()
    .min(0)
    .max(CATEGORIES.length - 1),
]);
const WireTrip = z.object({
  v: z.literal(1),
  n: z.string().min(1).max(120),
  c: z.string().max(120),
  k: z.string().max(120).optional(),
  d: z.array(z.array(WireStop).max(MAX_STOPS_PER_DAY)).min(1).max(MAX_DAYS),
});

export interface SharedTrip {
  name: string;
  city: string;
  days: NewPlace[][];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function encodeTrip(trip: Trip, byId: ReadonlyMap<string, Place>): string {
  const days = trip.days.map((d) => d.placeIds.map((id) => byId.get(id)).filter((p): p is Place => !!p));
  const wire: z.infer<typeof WireTrip> = {
    v: 1,
    n: trip.name,
    c: trip.city,
    k: days.flat().find((p) => p.country)?.country,
    d: days.map((stops) =>
      stops.map((p) => [p.name, round5(p.lat), round5(p.lng), CATEGORIES.indexOf(p.category)]),
    ),
  };
  return toLinkData(wire);
}

/** A link is untrusted input: anything that doesn't match the format exactly is refused. */
export function decodeTrip(encoded: string | undefined): SharedTrip | undefined {
  if (!encoded) return undefined;
  try {
    const wire = WireTrip.parse(fromLinkData(encoded));
    return {
      name: wire.n,
      city: wire.c,
      days: wire.d.map((stops) =>
        stops.map(([name, lat, lng, category]) => ({
          name,
          lat,
          lng,
          category: CATEGORIES[category],
          city: wire.c || undefined,
          country: wire.k,
          sourcePlatform: 'manual',
        })),
      ),
    };
  } catch {
    return undefined;
  }
}

/** Where the web app lives. Phones need EXPO_PUBLIC_WEB_URL; the web app knows its own address. */
export function webBase(): string | undefined {
  if (env.webUrl) return env.webUrl;
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
}

/** Undefined when there's nowhere to host the link; callers then share plain text. */
export function tripShareUrl(
  trip: Trip,
  byId: ReadonlyMap<string, Place>,
  base = webBase(),
): string | undefined {
  if (!base) return undefined;
  return `${base}/shared?d=${encodeTrip(trip, byId)}`;
}
