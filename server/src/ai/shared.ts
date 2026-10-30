import { z } from 'zod';
import type { ImageData, VideoData } from '../media.ts';

export const CATEGORIES = [
  'food',
  'cafe',
  'nightlife',
  'sight',
  'nature',
  'stay',
  'shopping',
  'activity',
  'other',
] as const;

export const ExtractionSchema = z.object({
  places: z.array(
    z.object({
      name: z.string().describe('Official venue or landmark name, without emojis or hashtags'),
      localName: z
        .string()
        .nullable()
        .describe('The name in the local language, as on signs and maps, when it differs from name'),
      city: z.string().nullable(),
      country: z.string().nullable(),
      category: z.enum(CATEGORIES),
      confidence: z.number().describe('0 to 1: how sure you are this is a real, specific, visitable place'),
    }),
  ),
});

export type ExtractedPlace = z.infer<typeof ExtractionSchema>['places'][number];

export const SYSTEM = `You extract real-world places from social media travel posts (Instagram Reels, TikToks, YouTube Shorts).

Return every specific, visitable place the post recommends or shows: restaurants, cafés, bars, hotels, viewpoints, beaches, museums, shops, trails, landmarks.
- Use the venue's proper name as a local would search for it on a map ("Cervejaria Ramiro", not "the seafood place").
- Venue @handles usually name the venue: "@cafe_kitsune_tokyo" -> "Café Kitsuné".
- When the name you give is a translation (often English), also give the local-language name in localName ("25 de Abril Bridge" -> "Ponte 25 de Abril"); maps only know the local one.
- Infer city and country from context (hashtags, the title, other places) when not stated per place.
- Skip creators' own handles, generic areas used only as hashtags, brands that are not a location, and calls to action.
- Score confidence lower when the name is ambiguous or you are guessing from a handle.
- When the post's cover image is attached, also read place names written on it (text overlays, signs, pins). Name a place from the scenery alone only for an unmistakable landmark.
- When the post's video is attached, also use place names spoken in it or shown on screen (text overlays, signs, menus, map pins). Name a place from the scenery alone only for an unmistakable landmark.
If the post mentions no specific places, return an empty list.`;

/** What a provider gets: the post's text and, when the text is weak, its cover image or video. */
export interface ExtractionInput {
  caption: string;
  url?: string;
  image?: ImageData;
  video?: VideoData;
}

export function userPrompt({ caption, url, image, video }: ExtractionInput): string {
  return [
    url && `Post URL: ${url}`,
    caption ? `Post text:\n"""\n${caption}\n"""` : 'The post has no text.',
    image && "The post's cover image is attached.",
    video && "The post's video is attached.",
  ]
    .filter(Boolean)
    .join('\n');
}

/** One AI backend. `extract` throws `ProviderError` (or anything) on failure; the chain moves on. */
export interface PlaceExtractor {
  name: string;
  /** Reads images. A text-only provider gets the caption alone, and is skipped when there is none. */
  vision: boolean;
  /** Watches video (YouTube links and short clips). Only video requests go to these. */
  video: boolean;
  extract(input: ExtractionInput): Promise<ExtractedPlace[]>;
}

export class ProviderError extends Error {
  /** Rate-limited or overloaded: worth retrying later rather than a bug. */
  readonly busy: boolean;
  constructor(message: string, busy = false) {
    super(message);
    this.busy = busy;
  }
}

/** Parse a provider's JSON text against the schema, so a malformed reply is a failure, not bad data. */
export function parseExtraction(json: string | undefined, provider: string): ExtractedPlace[] {
  if (!json) throw new ProviderError(`${provider}: empty response`);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProviderError(`${provider}: response is not JSON`);
  }
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError(`${provider}: response does not match the schema`);
  return parsed.data.places;
}

/** Map an HTTP failure from a provider's REST API to a ProviderError. */
export function httpError(provider: string, status: number): ProviderError {
  return new ProviderError(`${provider}: HTTP ${status}`, status === 429 || status === 503 || status === 529);
}
