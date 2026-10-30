/**
 * Instagram caption lookups from the server (parsing lives in `instagramEmbed.ts`, shared
 * with the app). The app reads captions on the phone first; this is the fallback, and the
 * only path for the web app (browsers can't fetch the embed page: CORS).
 *
 * This is unofficial: Instagram can change the page or block requests at any time (it often
 * refuses cloud-server IPs), and automated access may conflict with its terms. Guardrails:
 *  - public posts only, no login or cookies
 *  - results cached (and failures negative-cached) to keep requests minimal
 *  - outbound requests throttled, short timeouts
 *  - kill switch: INSTAGRAM_CAPTIONS=off
 *  - every lookup reports its outcome, so a block or format change shows up in the logs
 */

import {
  diagnoseEmbedPage,
  EMBED_HEADERS,
  embedUrl,
  imageFromEmbedPage,
  instagramShortcode,
  isInstagramUrl,
  isShareLink,
  locationFromEmbedPage,
  parseEmbedPage,
  videoFromEmbedPage,
  type EmbedFailure,
  type InstagramCaption,
} from './instagramEmbed.ts';

const ENABLED = (process.env.INSTAGRAM_CAPTIONS ?? 'on').toLowerCase() !== 'off';
const CACHE_TTL_MS = 24 * 60 * 60_000;
/** A post that rendered without a caption won't grow one soon. */
const NEGATIVE_TTL_MS = 30 * 60_000;
/** Blocks, throttling and network errors may clear quickly: retry sooner. */
const TRANSIENT_TTL_MS = 2 * 60_000;
const CACHE_MAX = 2_000;
const MIN_GAP_MS = 400;

/** `ok`, or why there's no caption. */
export type LookupOutcome =
  'ok' | 'disabled' | 'no_shortcode' | `http_${number}` | 'timeout' | 'network_error' | EmbedFailure;

export interface InstagramLookup {
  caption?: InstagramCaption;
  /** Cover image, reel video and location tag, found even when the post has no caption. */
  imageUrl?: string;
  videoUrl?: string;
  location?: string;
  outcome: LookupOutcome;
  /** HTTP status and page size of the embed request, when one was made. */
  status?: number;
  bytes?: number;
  /** Served from cache: no request was made. */
  cached?: boolean;
}

// ---------------------------------------------------------------------------
// Cache + throttle
// ---------------------------------------------------------------------------

type CacheEntry = { value: InstagramLookup; expires: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): InstagramLookup | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function ttlFor(outcome: LookupOutcome): number {
  if (outcome === 'ok') return CACHE_TTL_MS;
  return outcome === 'no_caption' || outcome === 'http_404' ? NEGATIVE_TTL_MS : TRANSIENT_TTL_MS;
}

function cacheSet(key: string, value: InstagramLookup) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + ttlFor(value.outcome) });
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialise Instagram requests with a small gap between them. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const result = await task();
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function resolveShareLink(url: string, fetcher: Fetcher): Promise<string> {
  if (!isShareLink(url)) return url;
  try {
    const res = await fetcher(url, {
      headers: EMBED_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

async function fetchEmbed(shortcode: string, fetcher: Fetcher): Promise<InstagramLookup> {
  try {
    const res = await fetcher(embedUrl(shortcode), {
      headers: EMBED_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { outcome: `http_${res.status}`, status: res.status };
    const html = (await res.text()).slice(0, 2_000_000);
    const caption = parseEmbedPage(html);
    return {
      caption,
      imageUrl: imageFromEmbedPage(html),
      videoUrl: videoFromEmbedPage(html),
      location: locationFromEmbedPage(html),
      outcome: caption ? 'ok' : diagnoseEmbedPage(html, res.url),
      status: res.status,
      bytes: html.length,
    };
  } catch (error) {
    return { outcome: (error as Error).name === 'TimeoutError' ? 'timeout' : 'network_error' };
  }
}

export async function fetchInstagramCaption(url: string, fetcher: Fetcher = fetch): Promise<InstagramLookup> {
  if (!ENABLED) return { outcome: 'disabled' };
  const shortcode = isInstagramUrl(url)
    ? instagramShortcode(await resolveShareLink(url, fetcher))
    : undefined;
  if (!shortcode) return { outcome: 'no_shortcode' };

  const cached = cacheGet(shortcode);
  if (cached) return { ...cached, cached: true };

  const result = await throttled(() => fetchEmbed(shortcode, fetcher));
  cacheSet(shortcode, result);
  return result;
}

/** Test hook. */
export function clearInstagramCache() {
  cache.clear();
}
