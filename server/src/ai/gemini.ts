import { CATEGORIES, SYSTEM, httpError, parseExtraction, userPrompt, type PlaceExtractor } from './shared.ts';

/**
 * Google Gemini over REST (free tier with an AI Studio key). Free-tier requests may be used by
 * Google to improve its products; captions are public posts, but say so in the privacy policy.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';

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
          city: { type: 'STRING', nullable: true },
          country: { type: 'STRING', nullable: true },
          category: { type: 'STRING', enum: [...CATEGORIES] },
          confidence: {
            type: 'NUMBER',
            description: '0 to 1: how sure you are this is a real, specific, visitable place',
          },
        },
        required: ['name', 'city', 'country', 'category', 'confidence'],
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
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          // Watching takes longer. Kept short enough that the cover fallback still fits in the app's 90 s.
          signal: AbortSignal.timeout(input.video ? 45_000 : 30_000),
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
        },
      );
      if (!r.ok) throw httpError('gemini', r.status);
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
      return parseExtraction(text, 'gemini');
    },
  };
}
