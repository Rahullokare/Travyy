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

export function geminiExtractor(): PlaceExtractor | undefined {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return undefined;
  return {
    name: 'gemini',
    vision: true,
    async extract(input) {
      const parts: object[] = [{ text: userPrompt(input) }];
      if (input.image) parts.unshift({ inlineData: input.image });
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
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
