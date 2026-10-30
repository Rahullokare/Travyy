/** A post's cover image, downloaded for AI extraction. */
export interface ImageData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  /** Base64, as both Gemini and Claude take inline images. */
  data: string;
}

const TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** Claude's per-image limit is 5 MB; covers and thumbnails are far smaller. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Image hosts the app may send a cover from (Instagram, TikTok and YouTube CDNs). The phone
 * reads Instagram's embed page, which the server often can't, so it passes the cover along;
 * limiting it to these hosts keeps /extract from fetching arbitrary URLs for a caller.
 */
const CDN_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'ibyteimg.com',
  'ytimg.com',
  'ggpht.com',
];

export function isTrustedImageHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && CDN_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Download an image over HTTPS. Anything that isn't a small JPEG/PNG/WebP/GIF is ignored. */
export async function fetchImage(url: string, fetcher: Fetcher = fetch): Promise<ImageData | undefined> {
  if (!url.startsWith('https://')) return undefined;
  try {
    const res = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    const mimeType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!res.ok || !TYPES.has(mimeType)) return undefined;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return undefined;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return undefined;
    return { mimeType: mimeType as ImageData['mimeType'], data: bytes.toString('base64') };
  } catch {
    return undefined;
  }
}
