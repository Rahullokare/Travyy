import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const CATEGORIES = ['food', 'cafe', 'nightlife', 'sight', 'nature', 'stay', 'shopping', 'activity', 'other'] as const;

const ExtractionSchema = z.object({
  places: z.array(
    z.object({
      name: z.string().describe('Official venue or landmark name, without emojis or hashtags'),
      city: z.string().nullable(),
      country: z.string().nullable(),
      category: z.enum(CATEGORIES),
      confidence: z.number().describe('0 to 1: how sure you are this is a real, specific, visitable place'),
    }),
  ),
});

export type ExtractedPlace = z.infer<typeof ExtractionSchema>['places'][number];

const SYSTEM = `You extract real-world places from social media travel posts (Instagram Reels, TikToks, YouTube Shorts).

Return every specific, visitable place the post recommends or shows: restaurants, cafés, bars, hotels, viewpoints, beaches, museums, shops, trails, landmarks.
- Use the venue's proper name as a local would search for it on a map ("Cervejaria Ramiro", not "the seafood place").
- Venue @handles usually name the venue: "@cafe_kitsune_tokyo" -> "Café Kitsuné".
- Infer city and country from context (hashtags, the title, other places) when not stated per place.
- Skip creators' own handles, generic areas used only as hashtags, brands that are not a location, and calls to action.
- Score confidence lower when the name is ambiguous or you are guessing from a handle.
If the post mentions no specific places, return an empty list.`;

const client = new Anthropic();

export async function extractPlaces(caption: string, url?: string): Promise<ExtractedPlace[]> {
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // If a safety classifier declines (rare for captions), the API retries on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Simple extraction: low effort keeps latency and cost down.
    output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${url ? `Post URL: ${url}\n` : ''}Post text:\n"""\n${caption}\n"""`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') return [];
  return (response.parsed_output?.places ?? []).filter((p) => p.name.trim().length > 1);
}
