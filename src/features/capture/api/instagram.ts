import { Platform } from 'react-native';
import { fetchWithTimeout } from '@/shared/lib/http';
import { logger } from '@/shared/lib/logger';
// Shared with the API so the phone and the server request and parse the page the same way.
// Pure functions only: no server code comes along.
import {
  diagnoseEmbedPage,
  EMBED_HEADERS,
  embedUrl,
  instagramShortcode,
  isShareLink,
  parseEmbedPage,
} from '../../../../server/src/instagramEmbed';

/**
 * Read a public Instagram post's caption from its embed page, on the phone.
 *
 * Instagram often refuses this request from cloud servers (our API on Render got pages
 * without the post in the first device test), but serves it to phones: one request, made
 * when the user shares a post they were just watching, like any site embedding it. The API
 * stays the fallback, and the only path on web, where browsers block the request (CORS).
 */
export async function readInstagramCaption(url: string, signal?: AbortSignal): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  try {
    let postUrl = url;
    if (isShareLink(url)) {
      postUrl =
        (await fetchWithTimeout(url, { headers: EMBED_HEADERS, timeoutMs: 8_000, signal })).url || url;
    }
    const shortcode = instagramShortcode(postUrl);
    if (!shortcode) {
      logger.warn('Instagram link has no post id', { url: postUrl });
      return undefined;
    }
    const res = await fetchWithTimeout(embedUrl(shortcode), {
      headers: EMBED_HEADERS,
      timeoutMs: 10_000,
      signal,
    });
    if (!res.ok) {
      logger.warn('Instagram caption not read on device', { outcome: `http_${res.status}` });
      return undefined;
    }
    const html = (await res.text()).slice(0, 2_000_000);
    const found = parseEmbedPage(html);
    if (!found) {
      logger.warn('Instagram caption not read on device', { outcome: diagnoseEmbedPage(html, res.url) });
    }
    return found?.text;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}
