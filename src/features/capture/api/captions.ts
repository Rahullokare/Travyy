import { Platform } from 'react-native';
import { z } from 'zod';
import type { SourcePlatform } from '@/domain/models';
import { fetchWithTimeout } from '@/shared/lib/http';
import { readInstagramCaption } from './instagram';

const OEmbedSchema = z.object({ title: z.string().optional() });
/** Contract of POST /caption on the Travyy API (server/src/index.ts). */
const ServerCaptionSchema = z.object({ caption: z.string().nullable() });

/**
 * Ask the Travyy API for a post's caption. The server can read captions the device
 * can't: Instagram (via its embed page) and any link from the web app (no CORS limits).
 */
export async function fetchServerCaption(
  apiUrl: string,
  url: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(`${apiUrl}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      timeoutMs: 75_000, // tolerates a free-tier cold start (≤60 s)
      signal,
    });
    if (!res.ok) return undefined;
    return ServerCaptionSchema.parse(await res.json()).caption?.trim() || undefined;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

/**
 * Best-effort public caption lookup on the device: oEmbed for TikTok/YouTube, the embed
 * page for Instagram, then Open Graph tags. Browsers block most cross-origin requests, so
 * on web this often returns undefined; the server (`fetchServerCaption`) covers those cases.
 */
export async function fetchCaption(
  url: string,
  platform: SourcePlatform,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (platform === 'instagram') return readInstagramCaption(url, signal);
  try {
    url = await resolveShortLink(url, signal);
    const oembed =
      platform === 'tiktok'
        ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        : platform === 'youtube'
          ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
          : undefined;
    if (oembed) {
      const res = await fetchWithTimeout(oembed, { signal });
      if (res.ok) return OEmbedSchema.parse(await res.json()).title;
    }
    // Browsers block cross-origin page requests, so don't spend one on web.
    if (Platform.OS === 'web') return undefined;
    const res = await fetchWithTimeout(url, { signal });
    if (!res.ok) return undefined;
    const html = (await res.text()).slice(0, 500_000);
    const meta = (prop: string) =>
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      )?.[1];
    const text = [meta('og:title'), meta('og:description') ?? meta('description')]
      .filter((s): s is string => !!s)
      .map(decodeEntities)
      .join('\n');
    return text || undefined;
  } catch {
    return undefined;
  }
}

/**
 * TikTok shares short links (vm.tiktok.com / vt.tiktok.com) that oEmbed may not accept.
 * Follow the redirect to the canonical video URL. Native only: browsers block
 * cross-origin redirects (CORS), so web keeps the short link.
 */
async function resolveShortLink(url: string, signal?: AbortSignal): Promise<string> {
  if (Platform.OS === 'web' || !/^https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) return url;
  try {
    const res = await fetchWithTimeout(url, { signal, timeoutMs: 8_000 });
    return res.url || url;
  } catch {
    return url;
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
