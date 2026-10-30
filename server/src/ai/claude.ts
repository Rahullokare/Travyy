import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtractionSchema, ProviderError, SYSTEM, userPrompt, type PlaceExtractor } from './shared.ts';

/** Claude (paid per use). Optional: best on messy captions, off unless a key is set. */
export function claudeExtractor(): PlaceExtractor | undefined {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  const client = new Anthropic();
  return {
    name: 'claude',
    async extract(caption, url) {
      try {
        const response = await client.beta.messages.parse({
          model: 'claude-opus-5-5',
          max_tokens: 16000,
          // If a safety classifier declines (rare for captions), the API retries on a fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Simple extraction: low effort keeps latency and cost down.
          output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionSchema) },
          system: SYSTEM,
          messages: [{ role: 'user', content: userPrompt(caption, url) }],
        });
        if (response.stop_reason === 'refusal') return [];
        return response.parsed_output?.places ?? [];
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) throw new ProviderError('claude: rate limited', true);
        if (e instanceof Anthropic.APIError)
          throw new ProviderError(`claude: HTTP ${e.status}`, e.status === 529);
        throw e;
      }
    },
  };
}
