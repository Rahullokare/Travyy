import {
  CATEGORIES,
  ProviderError,
  SYSTEM,
  httpError,
  parseExtraction,
  userPrompt,
  type ExtractedPlace,
  type ExtractionInput,
  type PlaceExtractor,
} from './shared.ts';

/**
 * Google Gemini over REST (free tier with an AI Studio key). Free-tier requests may be used by
 * Google to improve its products; captions are public posts, but say so in the privacy policy.
 */
/**
 * Models to try in order; the next one is used when a model is overloaded (503, or no answer in
 * time), rate-limited or retired. Free-tier capacity varies a lot by model: on 2026-10-30
 * gemini-3.8-flash hung or answered 503 to every request, while these answered in 1–6 s.
 */
const MODELS = (
  process.env.GEMINI_MODELS ??
  process.env.GEMINI_MODEL ??
  'gemini-3.5-flash-lite,gemini-3-flash-preview'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// generateContent's responseSchema is an OpenAPI subset, so it's written out rather than derived from zod.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    places: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            description: 'Official venue or landmark name, without emojis or hashtags',
          },
          localName: {
            type: 'STRING',
            nullable: true,
            description: 'The name in the local language, as on signs and maps, when it differs from name',
          },
          city: { type: 'STRING', nullable: true },
          country: { type: 'STRING', nullable: true },
          category: { type: 'STRING', enum: [...CATEGORIES] },
          confidence: {
            type: 'NUMBER',
            description: '0 to 1: how sure you are this is a real, specific, visitable place',
          },
        },
        required: ['name', 'localName', 'city', 'country', 'category', 'confidence'],
      },
    },
  },
  required: ['places'],
};

/** One frame every 2 s: enough to read on-screen names, at half the frames of the default (1 fps). */
const VIDEO_SAMPLING = { fps: 0.5 };

export function geminiExtractor(): PlaceExtractor | undefined {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return undefined;
  return {
    name: 'gemini',
    vision: true,
    video: true,
    async extract(input) {
      const errors: string[] = [];
      let busy = false;
      for (const model of MODELS) {
        try {
          return await generate(key, model, input);
        } catch (e) {
          // A model that doesn't answer in time is overloaded, not broken.
          busy ||= e instanceof ProviderError ? e.busy : true;
          errors.push(e instanceof ProviderError ? e.message : `gemini ${model}: ${String(e)}`);
        }
      }
      // Every model in one log line, to see which ones are struggling.
      throw new ProviderError(errors.join('; ') || 'gemini: no model configured', busy);
    },
  };
}

async function generate(key: string, model: string, input: ExtractionInput): Promise<ExtractedPlace[]> {
  const parts: object[] = [{ text: userPrompt(input) }];
  if (input.image) parts.unshift({ inlineData: input.image });
  if (input.video) {
    parts.unshift({
      ...('youtubeUrl' in input.video
        ? { fileData: { fileUri: input.video.youtubeUrl } }
        : { inlineData: input.video }),
      videoMetadata: VIDEO_SAMPLING,
    });
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    // Healthy models answer text in under 10 s. Short limits leave time for the next model,
    // then the cover fallback, within the app's 90 s.
    signal: AbortSignal.timeout(input.video ? 30_000 : 15_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      // No temperature: Gemini 3 models are tuned for the default, and lower values can make them loop.
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Picking names out of a post needs little reasoning; the default (medium) is much slower.
        thinkingConfig: { thinkingLevel: 'LOW' },
        ...(input.video && { mediaResolution: 'MEDIA_RESOLUTION_LOW' }),
      },
    }),
  });
  if (!r.ok) throw httpError(`gemini ${model}`, r.status);
  const body = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const candidate = body.candidates?.[0];
  // Blocked by a safety filter: treat like Claude's refusal, an answer with no places.
  if (!candidate || candidate.finishReason === 'SAFETY') return [];
  const text = candidate.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  return parseExtraction(text, `gemini ${model}`);
}
