import { claudeExtractor } from './ai/claude.ts';
import { geminiExtractor } from './ai/gemini.ts';
import { groqExtractor } from './ai/groq.ts';
import {
  ProviderError,
  type ExtractedPlace,
  type ExtractionInput,
  type PlaceExtractor,
} from './ai/shared.ts';
import { fetchImage, fetchVideo, youtubeWatchUrl, type ImageData, type VideoData } from './media.ts';

export type { ExtractedPlace, ExtractionInput, PlaceExtractor } from './ai/shared.ts';

/** Every provider in the chain failed and at least one said it was busy (rate limit / overload). */
export class AiBusyError extends Error {}

const FACTORIES: Record<string, () => PlaceExtractor | undefined> = {
  gemini: geminiExtractor,
  groq: groqExtractor,
  claude: claudeExtractor,
};

/**
 * Providers to try, in order. `AI_PROVIDERS` sets the order (default: the free ones first);
 * a provider without its API key is skipped.
 */
export function configuredExtractors(
  order = process.env.AI_PROVIDERS ?? 'gemini,groq,claude',
): PlaceExtractor[] {
  return order
    .split(',')
    .map((s) => FACTORIES[s.trim().toLowerCase()]?.())
    .filter((p): p is PlaceExtractor => !!p);
}

export interface ExtractionResult {
  places: ExtractedPlace[];
  provider: string;
  /** Providers that failed before one succeeded, for logging. */
  failures: { provider: string; message: string }[];
}

/**
 * Try each provider in turn; the first that answers wins (an empty list is a valid answer).
 * Text-only providers get the caption without the image, and are skipped when there is no caption.
 */
export async function extractPlaces(
  extractors: PlaceExtractor[],
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const failures: ExtractionResult['failures'] = [];
  let busy = false;
  for (const extractor of extractors) {
    if (input.image && !extractor.vision && !input.caption) continue;
    try {
      const sent = input.image && !extractor.vision ? { ...input, image: undefined } : input;
      const places = (await extractor.extract(sent)).filter((p) => p.name.trim().length > 1);
      return { places, provider: extractor.name, failures };
    } catch (e) {
      busy ||= e instanceof ProviderError && e.busy;
      failures.push({ provider: extractor.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  const summary =
    failures.map((f) => f.message).join('; ') ||
    (extractors.length ? 'no AI provider can read images' : 'no AI provider configured');
  throw busy ? new AiBusyError(summary) : new Error(summary);
}

/** Below this length a caption rarely names its places (a title, a hook line), so the cover or video is worth sending. */
export const WEAK_CAPTION = 200;

/** Kill switch for video extraction (YouTube links and Instagram reel clips). */
const VIDEO_ENABLED = (process.env.VIDEO_EXTRACTION ?? 'on').toLowerCase() !== 'off';

export interface PostInput {
  caption: string;
  url?: string;
  imageUrl?: string;
  /** A clip to download (Instagram reels, read by the phone). YouTube links in `url` are watched directly. */
  videoUrl?: string;
}

export type MediaUsed = 'none' | 'image' | 'video';

export interface MediaLoaders {
  image: (url: string) => Promise<ImageData | undefined>;
  video: (url: string) => Promise<VideoData | undefined>;
  videoEnabled: boolean;
}

const DEFAULT_LOADERS: MediaLoaders = { image: fetchImage, video: fetchVideo, videoEnabled: VIDEO_ENABLED };

/**
 * Extract places from a post, adding media only when it's likely to help, so free quota isn't
 * spent on captions that already list their places:
 *  - a full caption is tried alone first;
 *  - then the video (a YouTube link, or a clip), on providers that watch video; a failure here
 *    is logged and the next step runs, so video can never make extraction worse;
 *  - then the cover image, with the whole chain.
 */
export async function extractFromPost(
  extractors: PlaceExtractor[],
  { caption, url, imageUrl, videoUrl }: PostInput,
  loaders: MediaLoaders = DEFAULT_LOADERS,
): Promise<ExtractionResult & { media: MediaUsed }> {
  const failures: ExtractionResult['failures'] = [];
  const done = (result: ExtractionResult, media: MediaUsed) => ({
    ...result,
    failures: [...failures, ...result.failures],
    media,
  });

  // A full caption that found nothing: kept as the answer if no media helps.
  let textOnly: ExtractionResult | undefined;
  if (caption.length >= WEAK_CAPTION) {
    const first = await extractPlaces(extractors, { caption, url });
    if (first.places.length > 0) return done(first, 'none');
    failures.push(...first.failures);
    textOnly = { ...first, failures: [] };
  }

  const watchers = loaders.videoEnabled ? extractors.filter((e) => e.video) : [];
  if (watchers.length) {
    const youtubeUrl = url ? youtubeWatchUrl(url) : undefined;
    const video = youtubeUrl ? { youtubeUrl } : videoUrl ? await loaders.video(videoUrl) : undefined;
    if (video) {
      try {
        // The provider watched it: trust that answer, even an empty one.
        return done(await extractPlaces(watchers, { caption, url, video }), 'video');
      } catch (e) {
        failures.push({ provider: 'video', message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const cover = imageUrl && extractors.some((e) => e.vision) ? await loaders.image(imageUrl) : undefined;
  if (cover) return done(await extractPlaces(extractors, { caption, url, image: cover }), 'image');
  if (textOnly) return done(textOnly, 'none');
  if (!caption) return done({ places: [], provider: 'none', failures: [] }, 'none');
  return done(await extractPlaces(extractors, { caption, url }), 'none');
}
