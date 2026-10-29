import { z } from 'zod';
import type { SourcePlatform } from '@/domain/models';
import { fetchWithTimeout } from '@/shared/lib/http';

const OEmbedSchema = z.object({ title: z.string().optional() });

/**
 * Best-effort public caption lookup (oEmbed, then Open Graph tags).
 * Instagram requires login and browsers block most cross-origin HTML, so this
 * often returns undefined — the UI then asks the user to paste the caption.
 */
export async function fetchCaption(
  url: string,
  platform: SourcePlatform,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
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
