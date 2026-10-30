import { z } from 'zod';
import {
  ExtractionSchema,
  SYSTEM,
  httpError,
  parseExtraction,
  userPrompt,
  type PlaceExtractor,
} from './shared.ts';

/** Groq's OpenAI-compatible API (free tier). Used as the fallback when Gemini is down or rate-limited. */
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

// Strict structured outputs: every property required, no extra properties (zod's output schema does both).
const { $schema: _, ...JSON_SCHEMA } = z.toJSONSchema(ExtractionSchema) as Record<string, unknown>;

export function groqExtractor(): PlaceExtractor | undefined {
  const key = process.env.GROQ_API_KEY;
  if (!key) return undefined;
  return {
    name: 'groq',
    vision: false,
    async extract(input) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userPrompt(input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'places', strict: true, schema: JSON_SCHEMA },
          },
        }),
      });
      if (!r.ok) throw httpError('groq', r.status);
      const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return parseExtraction(body.choices?.[0]?.message?.content, 'groq');
    },
  };
}
