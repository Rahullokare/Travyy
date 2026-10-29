/**
 * Instagram caption reading.
 *
 * Instagram has no public caption API and its post pages require login. Its embed page
 * (`/p/<shortcode>/embed/captioned/`), the iframe Instagram serves for embedding public
 * posts on other sites, does include the caption. We read that page.
 *
 * This is unofficial: Instagram can change the page or block requests at any time, and
 * automated access may conflict with its terms. Guardrails:
 *  - public posts only, no login or cookies
 *  - results cached (and failures negative-cached) to keep requests minimal
 *  - outbound requests throttled, short timeouts
 *  - kill switch: INSTAGRAM_CAPTIONS=off
 *  - several parsing strategies, and every result reports which one matched,
 *    so a format change shows up in logs instead of silently failing
 */

export type CaptionSource = 'embed-json' | 'embed-html' | 'embed-meta';

export interface InstagramCaption {
  text: string;
  source: CaptionSource;
}

const ENABLED = (process.env.INSTAGRAM_CAPTIONS ?? 'on').toLowerCase() !== 'off';
const MAX_CAPTION = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const NEGATIVE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 2_000;
const MIN_GAP_MS = 400;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// /p/<code>, /reel/<code>, /reels/<code>, /tv/<code>, or /<username>/reel/<code>.
// `/share/reel/<token>` is a redirect token, not a shortcode, so it's excluded here.
const POST_PATH = /^\/(?!share\/)(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;

export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am';
  } catch {
    return false;
  }
}

/** `https://www.instagram.com/reel/C9xYz/?igsh=…` → `C9xYz`. Handles p/reel/reels/tv and /<user>/reel/. */
export function instagramShortcode(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(POST_PATH)?.[1];
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Parsing (pure, tested against fixtures in instagram.test.ts)
// ---------------------------------------------------------------------------

/** Decode a JSON string body (the part between the quotes). */
function decodeJsonString(body: string): string | undefined {
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return undefined;
  }
}

const JSON_PATTERNS = [
  // Classic GraphQL shape: "edge_media_to_caption":{"edges":[{"node":{"text":"…"}}]}
  /"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{[^{}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  // Newer API shape: "caption":{…,"text":"…"}
  /"caption"\s*:\s*\{[^{}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
];

/** Caption from JSON embedded in the page, including JSON that is itself inside a string (\"…\"). */
export function captionFromEmbeddedJson(html: string): string | undefined {
  const unescapedOnce = html
    .replace(/\\\\/g, '\u0000')
    .replace(/\\"/g, '"')
    .replace(/\u0000/g, '\\');
  for (const source of [html, unescapedOnce]) {
    for (const pattern of JSON_PATTERNS) {
      const body = source.match(pattern)?.[1];
      const text = body !== undefined ? decodeJsonString(body)?.trim() : undefined;
      if (text) return text;
    }
  }
  return undefined;
}

/** Caption from the rendered `<div class="Caption">` block of the embed page. */
export function captionFromEmbedHtml(html: string): string | undefined {
  const start = html.search(/<div[^>]*class="[^"]*\bCaption\b[^"]*"[^>]*>/);
  if (start === -1) return undefined;
  let block = html.slice(start);
  // The caption block is followed by comments and the footer; cut there.
  const end = block.search(/<div[^>]*class="[^"]*\b(?:CaptionComments|SocialProof|Footer)\b/);
  if (end > 0) block = block.slice(0, end);
  const text = decodeHtmlEntities(
    block
      .replace(/<a[^>]*class="[^"]*\bCaptionUsername\b[^"]*"[^>]*>[\s\S]*?<\/a>/, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

/** Last resort: description meta tags, e.g. `123 likes, 4 comments - user on May 1: "caption".` */
export function captionFromMeta(html: string): string | undefined {
  const meta = (prop: string) =>
    html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    )?.[1];
  const raw = meta('og:description') ?? meta('description');
  if (!raw) return undefined;
  const decoded = decodeHtmlEntities(raw).trim();
  // Prefer the quoted caption when the description wraps it in engagement stats.
  const quoted = decoded.match(/:\s*["“]([\s\S]+)["”]\.?\s*$/)?.[1];
  const text = (quoted ?? decoded).trim();
  // A bare "123 likes, 4 comments" line carries no caption.
  if (/^[\d,.\sKkMm]+likes?,/.test(text) && !quoted) return undefined;
  return text || undefined;
}

export function parseEmbedPage(html: string): InstagramCaption | undefined {
  const strategies: [CaptionSource, (h: string) => string | undefined][] = [
    ['embed-json', captionFromEmbeddedJson],
    ['embed-html', captionFromEmbedHtml],
    ['embed-meta', captionFromMeta],
  ];
  for (const [source, parse] of strategies) {
    const text = parse(html);
    if (text) return { text: text.slice(0, MAX_CAPTION), source };
  }
  return undefined;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Fetching (cached + throttled)
// ---------------------------------------------------------------------------

type CacheEntry = { value: InstagramCaption | null; expires: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function cacheSet(key: string, value: InstagramCaption | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + (value ? CACHE_TTL_MS : NEGATIVE_TTL_MS) });
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

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** `/share/…` links redirect to the canonical post URL. */
async function resolveShareLink(url: string, fetcher: Fetcher): Promise<string> {
  if (instagramShortcode(url) || !/\/share\//.test(url)) return url;
  try {
    const res = await fetcher(url, {
      headers: { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

export async function fetchInstagramCaption(
  url: string,
  fetcher: Fetcher = fetch,
): Promise<InstagramCaption | undefined> {
  if (!ENABLED || !isInstagramUrl(url)) return undefined;
  const shortcode = instagramShortcode(await resolveShareLink(url, fetcher));
  if (!shortcode) return undefined;

  const cached = cacheGet(shortcode);
  if (cached) return cached.value ?? undefined;

  const result = await throttled(async () => {
    try {
      const res = await fetcher(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return undefined;
      return parseEmbedPage((await res.text()).slice(0, 2_000_000));
    } catch {
      return undefined;
    }
  });
  cacheSet(shortcode, result ?? null);
  return result;
}

/** Test hook. */
export function clearInstagramCache() {
  cache.clear();
}
