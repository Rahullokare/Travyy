import { fetchInstagramCaption } from './instagram.ts';
import { decodeHtmlEntities, isInstagramUrl, withLocationTag } from './instagramEmbed.ts';

const USER_AGENT = process.env.GEOCODER_USER_AGENT ?? 'Travyy/1.0 (contact: set GEOCODER_USER_AGENT)';

async function get(url: string, ms = 10_000): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(ms),
    redirect: 'follow',
  });
}

export interface CaptionLookup {
  text?: string;
  /** The post's cover image or thumbnail, for AI extraction when the caption is weak. */
  imageUrl?: string;
  source: string | null;
  /** Extra `caption_lookup` log fields: outcome, HTTP status, page size. Never caption text. */
  detail?: Record<string, string | number | boolean | undefined>;
}

/**
 * Public caption lookup: oEmbed for TikTok/YouTube, the embed page for Instagram
 * (see instagram.ts), Open Graph tags for anything else. An Instagram location tag is
 * added to the text as a "📍 Name" line.
 */
export async function fetchCaption(url: string): Promise<CaptionLookup> {
  try {
    if (isInstagramUrl(url)) {
      const { caption, imageUrl, location, ...detail } = await fetchInstagramCaption(url);
      const text = withLocationTag(caption?.text, location);
      return { text, imageUrl, source: caption?.source ?? (location ? 'embed-location' : null), detail };
    }
    const host = new URL(url).hostname;
    const oembed = host.endsWith('tiktok.com')
      ? ['tiktok-oembed', `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`]
      : host.endsWith('youtube.com') || host === 'youtu.be'
        ? ['youtube-oembed', `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`]
        : undefined;
    if (oembed) {
      const r = await get(oembed[1]);
      const body = r.ok ? ((await r.json()) as { title?: string; thumbnail_url?: string }) : {};
      const title = body.title?.trim();
      if (title) return { text: title, imageUrl: body.thumbnail_url, source: oembed[0] };
    }
    const r = await get(url);
    if (!r.ok) return { source: null, detail: { outcome: `http_${r.status}`, status: r.status } };
    const html = (await r.text()).slice(0, 500_000);
    const meta = (prop: string) =>
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      )?.[1];
    const text = [meta('og:title'), meta('og:description') ?? meta('description')]
      .filter(Boolean)
      .map((t) => decodeHtmlEntities(t!))
      .join('\n');
    const image = meta('og:image');
    const imageUrl = image?.startsWith('https://') ? decodeHtmlEntities(image) : undefined;
    return text
      ? { text, imageUrl, source: 'open-graph' }
      : { imageUrl, source: null, detail: { outcome: 'no_caption' } };
  } catch {
    return { source: null, detail: { outcome: 'network_error' } };
  }
}

export interface GeoHit {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  country?: string;
}

const cache = new Map<string, GeoHit | null>();
let last = 0;

/**
 * OpenStreetMap Nominatim (free, 1 req/s). For production volume swap in
 * Google Places / Mapbox / a self-hosted Nominatim — the interface stays the same.
 */
export async function geocode(query: string): Promise<GeoHit | undefined> {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const wait = Math.max(0, last + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  try {
    const r = await get(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,
    );
    const [hit] = r.ok
      ? ((await r.json()) as {
          lat: string;
          lon: string;
          display_name: string;
          address?: { city?: string; town?: string; village?: string; country?: string };
        }[])
      : [];
    const result: GeoHit | null = hit
      ? {
          lat: parseFloat(hit.lat),
          lng: parseFloat(hit.lon),
          address: hit.display_name,
          city: hit.address?.city ?? hit.address?.town ?? hit.address?.village,
          country: hit.address?.country,
        }
      : null;
    cache.set(key, result);
    return result ?? undefined;
  } catch {
    return undefined;
  }
}
