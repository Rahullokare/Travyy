import { claudeExtractor } from './ai/claude.ts';
import { geminiExtractor } from './ai/gemini.ts';
import { groqExtractor } from './ai/groq.ts';
import { ProviderError, type ExtractedPlace, type PlaceExtractor } from './ai/shared.ts';

export type { ExtractedPlace, PlaceExtractor } from './ai/shared.ts';

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

/** Try each provider in turn; the first that answers wins (an empty list is a valid answer). */
export async function extractPlaces(
  extractors: PlaceExtractor[],
  caption: string,
  url?: string,
): Promise<ExtractionResult> {
  const failures: ExtractionResult['failures'] = [];
  let busy = false;
  for (const extractor of extractors) {
    try {
      const places = (await extractor.extract(caption, url)).filter((p) => p.name.trim().length > 1);
      return { places, provider: extractor.name, failures };
    } catch (e) {
      busy ||= e instanceof ProviderError && e.busy;
      failures.push({ provider: extractor.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  const summary = failures.map((f) => f.message).join('; ') || 'no AI provider configured';
  throw busy ? new AiBusyError(summary) : new Error(summary);
}
