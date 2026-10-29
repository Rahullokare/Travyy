import { z } from 'zod';
import { CandidateSchema, type Candidate, type SourcePlatform } from '@/domain/models';
import { guessCategory } from '@/features/places/categories';
import { env } from '@/shared/config/env';
import { apiHasAi, rememberApiHasAi } from '@/shared/lib/apiStatus';
import { fetchJson, HttpError } from '@/shared/lib/http';
import { logger } from '@/shared/lib/logger';
import { detectPlatform, extractUrl, parseGoogleMapsUrl } from '../links';
import { parseCaption } from '../parseCaption';
import { fetchCaption, fetchServerCaption } from './captions';
import { geocodeCandidates, reverseGeocode, searchPlaces } from './geocoding';

const SHORT_TEXT = 200;

export type ExtractionEngine = 'ai' | 'rules' | 'maps-link' | 'search';

export interface ExtractionResult {
  platform: SourcePlatform;
  sourceUrl?: string;
  caption?: string;
  candidates: Candidate[];
  /** Which engine produced the result — shown to the user for transparency. */
  engine: ExtractionEngine;
}

export interface ExtractionInput {
  url?: string;
  text?: string;
}

/** Contract of POST /extract on the Travyy API (server/src/index.ts). */
const ApiResponseSchema = z.object({
  caption: z.string().nullable(),
  places: z.array(CandidateSchema),
});

/**
 * Link/caption → candidate places. Strategy, best first:
 *  1. Google Maps links are parsed directly (exact, free).
 *  2. AI backend, if the API has it (Instagram captions are read on the phone first).
 *  3. On-device rules + OpenStreetMap geocoding (always available).
 *  4. A bare place name falls back to place search.
 */
export async function extractPlaces(input: ExtractionInput, signal?: AbortSignal): Promise<ExtractionResult> {
  const url = extractUrl(input.url ?? '') ?? extractUrl(input.text ?? '');
  const typed = input.text?.replace(url ?? '', '').trim() || undefined;
  const platform: SourcePlatform = url ? detectPlatform(url) : 'manual';

  if (url && platform === 'google_maps') {
    const candidates = await fromMapsLink(url, signal);
    // Maps shares are "Place name\nhttps://maps.app.goo.gl/…": if the link can't be
    // resolved (short links on web), the name alone is enough to search.
    if (candidates.length === 0 && typed && typed.length <= 80) {
      return {
        platform,
        sourceUrl: url,
        candidates: await searchPlaces(typed, { limit: 5, signal }),
        engine: 'search',
      };
    }
    return { platform, sourceUrl: url, candidates, engine: 'maps-link' };
  }

  // Short text next to a link (share-sheet boilerplate, a title) isn't the caption:
  // still fetch the real one. A long pasted caption is used as-is.
  const wantsCaption = !!url && (!typed || typed.length < SHORT_TEXT);
  const fetched = wantsCaption ? await fetchCaption(url, platform, signal) : undefined;
  let caption = [typed, fetched].filter(Boolean).join('\n').trim() || undefined;

  if (env.apiUrl) {
    // Skip a server known to have no AI (the free setup): waking it would only get a 503.
    if ((await apiHasAi()) !== false) {
      try {
        const res = ApiResponseSchema.parse(
          await fetchJson(`${env.apiUrl}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, text: caption }),
            // Cold start on free hosting (≤60 s) + AI extraction.
            timeoutMs: 90_000,
            signal,
          }),
        );
        return {
          platform,
          sourceUrl: url,
          caption: res.caption ?? caption,
          candidates: res.places,
          engine: 'ai',
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof HttpError && error.status === 503) rememberApiHasAi(false);
        logger.warn('AI extraction failed; falling back to on-device rules', { error: String(error) });
      }
    }
    // The device couldn't read the caption (Instagram, or any link on web): the server
    // can, even when AI extraction is unavailable. Then the on-device rules take over.
    if (wantsCaption && !fetched) {
      const serverCaption = await fetchServerCaption(env.apiUrl, url!, signal);
      if (serverCaption) caption = [typed, serverCaption].filter(Boolean).join('\n').trim();
    }
  }

  if (!caption) return { platform, sourceUrl: url, candidates: [], engine: 'rules' };

  const { candidates, cityHint } = parseCaption(caption);
  if (candidates.length > 0) {
    const geocoded = await geocodeCandidates(candidates.slice(0, 12), { cityHint, signal });
    return { platform, sourceUrl: url, caption, candidates: geocoded, engine: 'rules' };
  }

  // No list structure: treat short text like "Ichiran Shibuya" as a place search.
  if (!url && caption.length <= 80) {
    const hits = await searchPlaces(caption, { limit: 5, signal });
    return { platform, caption, candidates: hits, engine: 'search' };
  }
  return { platform, sourceUrl: url, caption, candidates: [], engine: 'rules' };
}

async function fromMapsLink(url: string, signal?: AbortSignal): Promise<Candidate[]> {
  let full = url;
  if (/goo\.gl/.test(url)) {
    // Short links redirect to the full URL. Native follows it; browsers usually block it (CORS).
    try {
      full = (await fetch(url, { signal })).url || url;
    } catch {
      // keep the short link
    }
  }
  const info = parseGoogleMapsUrl(full);
  if (!info.name && info.lat === undefined) return [];
  const name = info.name ?? 'Dropped pin';
  if (info.lat !== undefined && info.lng !== undefined) {
    const where = await reverseGeocode({ lat: info.lat, lng: info.lng }, signal);
    return [
      {
        name,
        lat: info.lat,
        lng: info.lng,
        city: where?.city,
        country: where?.country,
        address: where?.address,
        category: guessCategory(name),
        confidence: 0.95,
      },
    ];
  }
  return geocodeCandidates([{ name, category: guessCategory(name), confidence: 0.9 }], { signal });
}
