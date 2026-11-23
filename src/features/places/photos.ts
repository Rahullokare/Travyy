import { useEffect } from 'react';
import { Platform } from 'react-native';
import { z } from 'zod';
import type { Place } from '@/domain/models';
import { distanceMeters } from '@/shared/lib/geo';
import { fetchWithTimeout } from '@/shared/lib/http';
import { logger } from '@/shared/lib/logger';
import { usePhotoStore, type PlacePhoto } from '@/store';
import { fold } from './vault';

/**
 * Real photos for saved places, from Wikipedia: free, no key, and each photo comes with the
 * article it illustrates, so it can be credited. Reel covers would be closer to what someone saw,
 * but Instagram's and TikTok's image links are signed and stop working within days.
 *
 * A wrong photo is worse than none, so a match has to be the place itself: the top search result
 * for its name, close to where it's saved, and sharing a distinctive word with the name
 * ("Torre de Belém" ↔ "Belém Tower"). Cafés and small venues rarely have an article; they keep
 * the illustrated card.
 */

const API = 'https://en.wikipedia.org/w/api.php';
// Wikimedia asks apps to identify themselves; browsers can't set User-Agent (and origin=* covers CORS).
const HEADERS: Record<string, string> =
  Platform.OS === 'web' ? {} : { 'User-Agent': 'Travyy/1.0 (travel saves app)' };
/** Retry "nothing found" after this long: articles and photos get added. */
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const NEAR_M = 1500;
/** An exact title can be farther: an island's or a park's article sits at its centre. */
const EXACT_NEAR_M = 25_000;

/** Words that say what kind of place it is rather than which one. */
const GENERIC = new Set(
  'the of and de da do dos das del della di la le les el los las au cafe coffee restaurant bar pub hotel hostel house beach park temple church museum market shop store'.split(
    ' ',
  ),
);

const PageSchema = z.object({
  title: z.string(),
  index: z.number().optional(),
  coordinates: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
  thumbnail: z.object({ source: z.string().url() }).optional(),
  pageimage: z.string().optional(),
});
type Page = z.infer<typeof PageSchema>;
const ResponseSchema = z.object({
  query: z.object({ pages: z.record(z.string(), PageSchema) }).optional(),
});

export function photoKey(p: Pick<Place, 'name' | 'lat' | 'lng'>): string {
  return `${fold(p.name.trim())}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
}

const words = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !GENERIC.has(w));

/** The article that is this place, if the search found it. Pure, so it's unit-tested. */
export function pickPhotoPage(place: Pick<Place, 'name' | 'lat' | 'lng'>, pages: Page[]): Page | undefined {
  const name = words(place.name);
  if (name.length === 0) return undefined;
  const ranked = [...pages].sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const [i, page] of ranked.entries()) {
    if (!page.thumbnail || /\.svg/i.test(page.pageimage ?? page.thumbnail.source)) continue;
    const at = page.coordinates?.[0];
    const away = at ? distanceMeters(place, { lat: at.lat, lng: at.lon }) : Infinity;
    const title = words(page.title);
    const exact = title.join(' ') === name.join(' ');
    if (exact && away <= EXACT_NEAR_M) return page;
    // The top hit, nearby, naming the same thing in other words.
    if (i === 0 && away <= NEAR_M && name.some((w) => title.includes(w))) return page;
    // Any hit, nearby, whose title has every distinctive word of the name.
    if (away <= NEAR_M && name.every((w) => title.includes(w))) return page;
  }
  return undefined;
}

async function lookUp(place: Pick<Place, 'name' | 'lat' | 'lng'>): Promise<Omit<PlacePhoto, 'checkedAt'>> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: place.name,
    gsrlimit: '5',
    prop: 'pageimages|coordinates',
    piprop: 'thumbnail|name',
    pithumbsize: '640',
  });
  const res = await fetchWithTimeout(`${API}?${params}`, { headers: HEADERS, timeoutMs: 10_000 });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const parsed = ResponseSchema.safeParse(await res.json());
  const pages = parsed.success ? Object.values(parsed.data.query?.pages ?? {}) : [];
  const page = pickPhotoPage(place, pages);
  return page?.thumbnail ? { url: page.thumbnail.source, page: page.title } : {};
}

// A few lookups at a time, each place once per session: a grid of cards mounts many at once.
const MAX_PARALLEL = 2;
const queue: (() => Promise<void>)[] = [];
const started = new Set<string>();
let running = 0;
function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}

function requestPhoto(place: Pick<Place, 'name' | 'lat' | 'lng'>) {
  const key = photoKey(place);
  if (started.has(key)) return;
  started.add(key);
  queue.push(async () => {
    try {
      usePhotoStore.getState().savePhoto(key, await lookUp(place));
    } catch (error) {
      // Offline or rate-limited: try again next session, and keep the illustrated card meanwhile.
      started.delete(key);
      logger.warn('Photo lookup failed', { error: String(error) });
    }
  });
  pump();
}

/** The photo for a place, or undefined while unknown or when there isn't one. Looks it up when needed. */
export function usePlacePhoto(place: Pick<Place, 'name' | 'lat' | 'lng'>): PlacePhoto | undefined {
  const key = photoKey(place);
  const photo = usePhotoStore((s) => s.photos[key]);
  const checkedAt = photo?.checkedAt;
  const found = !!photo?.url;
  useEffect(() => {
    const stale = checkedAt === undefined || (!found && Date.now() - checkedAt > RECHECK_MS);
    if (stale) requestPhoto(place);
    // The key covers what the lookup depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checkedAt, found]);
  return photo?.url ? photo : undefined;
}

/** A photo that failed to load (moved, deleted on Commons) is forgotten, so the card falls back. */
export function forgetPhoto(place: Pick<Place, 'name' | 'lat' | 'lng'>) {
  usePhotoStore.getState().savePhoto(photoKey(place), {});
}
