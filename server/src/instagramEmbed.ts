/**
 * Reading a caption (plus cover image, video and location tag) from Instagram's embed page — shared by the API (`instagram.ts`) and the
 * app (`src/features/capture/api/instagram.ts`), so both request and parse it the same way.
 *
 * Pure functions with no imports and no Node or React Native APIs: both TypeScript projects
 * compile this file as is, and the server's fixture tests cover both.
 *
 * Instagram has no public caption API and its post pages require login. Its embed page
 * (`/p/<shortcode>/embed/captioned/`), the iframe Instagram serves for embedding public
 * posts on other sites, does include the caption. This is unofficial: Instagram can change
 * the page at any time, so there are several parsing strategies and every result reports
 * which one matched (or why none did).
 */

export type CaptionSource = 'embed-json' | 'embed-html' | 'embed-meta';

export interface InstagramCaption {
  text: string;
  source: CaptionSource;
}

/** Why a fetched embed page had no caption. */
export type EmbedFailure = 'login_wall' | 'no_post_data' | 'no_caption';

const MAX_CAPTION = 5_000;

/**
 * Sent with every embed request (server and phone), so Instagram serves both the page the parser expects.
 * The app identifies itself honestly: since 2026-10 Instagram answers a desktop-browser User-Agent
 * without a real browser behind it with an error page (`no_post_data`), while plain app clients
 * still get the embed with its caption.
 */
export const EMBED_HEADERS = {
  'User-Agent': 'Travyy/1.0 (travel saves app)',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html',
};

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

/** `/share/…` links redirect to the canonical post URL; resolve them before looking for a shortcode. */
export function isShareLink(url: string): boolean {
  return isInstagramUrl(url) && !instagramShortcode(url) && /\/share\//.test(url);
}

/** `https://www.instagram.com/reel/C9xYz/?igsh=…` → `C9xYz`. Handles p/reel/reels/tv and /<user>/reel/. */
export function instagramShortcode(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(POST_PATH)?.[1];
  } catch {
    return undefined;
  }
}

export function embedUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}

// ---------------------------------------------------------------------------
// Parsing (tested against fixtures in instagram.test.ts)
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
  // One pass, so `\\\/` (an escaped slash inside the inner JSON) becomes `\/`, not `\\/`.
  const unescapedOnce = html.replace(/\\(["\\/])/g, '$1');
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

/** The post's cover image (for reels, the video's poster frame): post JSON, then the rendered image, then og:image. */
export function imageFromEmbedPage(html: string): string | undefined {
  const unescapedOnce = html.replace(/\\(["\\/])/g, '$1');
  for (const source of [html, unescapedOnce]) {
    for (const pattern of [
      /"display_url"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"thumbnail_src"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    ]) {
      const body = source.match(pattern)?.[1];
      const url = body !== undefined ? decodeJsonString(body) : undefined;
      if (url?.startsWith('https://')) return url;
    }
  }
  const img = html.match(/<img[^>]*class="[^"]*\bEmbeddedMediaImage\b[^"]*"[^>]*>/)?.[0];
  const src = img?.match(/\ssrc="([^"]+)"/)?.[1];
  if (src?.startsWith('https://')) return decodeHtmlEntities(src);
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  return og?.startsWith('https://') ? decodeHtmlEntities(og) : undefined;
}

/** A reel's video file (MP4 on Instagram's CDN), when the page includes it. Only the post JSON carries it. */
export function videoFromEmbedPage(html: string): string | undefined {
  const unescapedOnce = html.replace(/\\(["\\/])/g, '$1');
  for (const source of [html, unescapedOnce]) {
    const body = source.match(/"video_url"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    const url = body !== undefined ? decodeJsonString(body) : undefined;
    if (url?.startsWith('https://')) return url;
  }
  return undefined;
}

/** The post's location tag ("Cervejaria Ramiro"), when the creator added one. Only the post JSON carries it. */
export function locationFromEmbedPage(html: string): string | undefined {
  const unescapedOnce = html.replace(/\\(["\\/])/g, '$1');
  for (const source of [html, unescapedOnce]) {
    const body = source.match(/"location"\s*:\s*\{[^{}]*?"name"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    const name = body !== undefined ? decodeJsonString(body)?.trim() : undefined;
    if (name) return name;
  }
  return undefined;
}

/**
 * Add the location tag to the caption as a "📍 Name" line, the convention both the AI prompt
 * and the phone's caption rules already read. Skipped when the caption already names it.
 */
export function withLocationTag(
  caption: string | undefined,
  location: string | undefined,
): string | undefined {
  if (!location || caption?.toLowerCase().includes(location.toLowerCase())) return caption;
  return [caption, `📍 ${location}`].filter(Boolean).join('\n\n');
}

// Present when the page rendered a post at all (media, caption block or post JSON).
const POST_MARKERS =
  /shortcode_media|edge_media_to_caption|class="[^"]*\b(?:EmbeddedMedia|Caption|EmbedHeader)\b/;

/**
 * Why a page `parseEmbedPage` found nothing in had no caption: a login wall (blocked), a page
 * without the post (blocked or throttled; common for requests from cloud servers), or a post
 * that has no caption. `finalUrl` is the URL after redirects.
 */
export function diagnoseEmbedPage(html: string, finalUrl = ''): EmbedFailure {
  if (/\/accounts\/login|\/challenge\//.test(finalUrl) || /<title>\s*Log ?in\b/i.test(html)) {
    return 'login_wall';
  }
  return POST_MARKERS.test(html) ? 'no_caption' : 'no_post_data';
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
