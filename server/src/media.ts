/** A post's cover image, downloaded for AI extraction. */
export interface ImageData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  /** Base64, as both Gemini and Claude take inline images. */
  data: string;
}

/** A post's video for a provider that watches video: a public YouTube link, or a downloaded clip. */
export type VideoData = { youtubeUrl: string } | { mimeType: string; data: string };

const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** Claude's per-image limit is 5 MB; covers and thumbnails are far smaller. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const VIDEO_TYPES = new Set<string>(['video/mp4', 'video/quicktime', 'video/webm']);
/** Gemini takes inline media up to ~20 MB per request; base64 adds a third. Reels are usually 2–10 MB. */
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

/**
 * Media hosts the app may send a cover or video from (Instagram, TikTok and YouTube CDNs). The
 * phone reads Instagram's embed page, which the server often can't, so it passes them along;
 * limiting them to these hosts keeps /extract from fetching arbitrary URLs for a caller.
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

export function isTrustedMediaHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && CDN_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * `youtube.com/watch?v=…`, `youtu.be/…` and `youtube.com/shorts/…` → the canonical watch URL
 * Gemini accepts. Anything else (channels, playlists, other sites) → undefined.
 */
export function youtubeWatchUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    const id =
      host === 'youtu.be'
        ? u.pathname.slice(1).split('/')[0]
        : host === 'youtube.com'
          ? u.pathname === '/watch'
            ? u.searchParams.get('v')
            : u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]
          : undefined;
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : undefined;
  } catch {
    return undefined;
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Download over HTTPS; undefined unless the response is one of `types` and at most `maxBytes`. */
async function download(
  url: string,
  types: Set<string>,
  maxBytes: number,
  timeoutMs: number,
  fetcher: Fetcher,
): Promise<{ mimeType: string; data: string } | undefined> {
  if (!url.startsWith('https://')) return undefined;
  try {
    const res = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const mimeType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!res.ok || !types.has(mimeType)) return undefined;
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return undefined;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maxBytes) return undefined;
    return { mimeType, data: bytes.toString('base64') };
  } catch {
    return undefined;
  }
}

/** A small JPEG/PNG/WebP/GIF, or undefined. */
export async function fetchImage(url: string, fetcher: Fetcher = fetch): Promise<ImageData | undefined> {
  return (await download(url, IMAGE_TYPES, MAX_IMAGE_BYTES, 10_000, fetcher)) as ImageData | undefined;
}

/** A short MP4/MOV/WebM clip, or undefined. */
export async function fetchVideo(url: string, fetcher: Fetcher = fetch): Promise<VideoData | undefined> {
  return download(url, VIDEO_TYPES, MAX_VIDEO_BYTES, 20_000, fetcher);
}
