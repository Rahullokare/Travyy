import { claudeExtractor } from './ai/claude.ts';
import { geminiExtractor } from './ai/gemini.ts';
import { groqExtractor } from './ai/groq.ts';
import {
  ProviderError,
  type ExtractedPlace,
  type ExtractionInput,
  type PlaceExtractor,
} from './ai/shared.ts';
import { fetchImage, type ImageData } from './images.ts';

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

/** Below this length a caption rarely names its places (a title, a hook line), so the cover image is worth sending. */
export const WEAK_CAPTION = 200;

export interface PostInput {
  caption: string;
  url?: string;
  imageUrl?: string;
}

/**
 * Extract places from a post, adding its cover image only when it's likely to help, so free
 * image quota isn't spent on captions that already list their places: a weak caption is sent
 * with the image; a full caption is sent alone, and again with the image if it finds nothing.
 */
export async function extractFromPost(
  extractors: PlaceExtractor[],
  { caption, url, imageUrl }: PostInput,
  loadImage: (url: string) => Promise<ImageData | undefined> = fetchImage,
): Promise<ExtractionResult & { usedImage: boolean }> {
  const image = async () => (imageUrl && extractors.some((e) => e.vision) ? loadImage(imageUrl) : undefined);

  if (caption.length < WEAK_CAPTION) {
    const cover = await image();
    if (!caption && !cover) return { places: [], provider: 'none', failures: [], usedImage: false };
    return { ...(await extractPlaces(extractors, { caption, url, image: cover })), usedImage: !!cover };
  }
  const first = await extractPlaces(extractors, { caption, url });
  if (first.places.length > 0) return { ...first, usedImage: false };
  const cover = await image();
  if (!cover) return { ...first, usedImage: false };
  const second = await extractPlaces(extractors, { caption, url, image: cover });
  return { ...second, failures: [...first.failures, ...second.failures], usedImage: true };
}
