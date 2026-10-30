import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ProviderError, parseExtraction, type ExtractedPlace, type PlaceExtractor } from './ai/shared.ts';
import { AiBusyError, configuredExtractors, extractPlaces } from './extract.ts';

const RAMIRO: ExtractedPlace = {
  name: 'Cervejaria Ramiro',
  city: 'Lisbon',
  country: 'Portugal',
  category: 'food',
  confidence: 0.9,
};

function fake(name: string, result: ExtractedPlace[] | Error): PlaceExtractor & { calls: number } {
  return {
    name,
    calls: 0,
    async extract() {
      this.calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('extractPlaces', () => {
  it('uses the first provider that answers and reports earlier failures', async () => {
    const first = fake('gemini', new ProviderError('gemini: HTTP 500'));
    const second = fake('groq', [RAMIRO]);
    const third = fake('claude', []);
    const result = await extractPlaces([first, second, third], 'caption');
    assert.equal(result.provider, 'groq');
    assert.deepEqual(result.places, [RAMIRO]);
    assert.deepEqual(result.failures, [{ provider: 'gemini', message: 'gemini: HTTP 500' }]);
    assert.equal(third.calls, 0);
  });

  it('treats an empty list as an answer, not a failure', async () => {
    const first = fake('gemini', []);
    const second = fake('groq', [RAMIRO]);
    const result = await extractPlaces([first, second], 'no places here');
    assert.equal(result.provider, 'gemini');
    assert.deepEqual(result.places, []);
    assert.equal(second.calls, 0);
  });

  it('drops one-character names', async () => {
    const result = await extractPlaces([fake('gemini', [{ ...RAMIRO, name: ' x ' }, RAMIRO])], 'caption');
    assert.deepEqual(result.places, [RAMIRO]);
  });

  it('throws AiBusyError when every provider fails and one was rate-limited', async () => {
    await assert.rejects(
      extractPlaces(
        [fake('gemini', new ProviderError('gemini: HTTP 429', true)), fake('groq', new Error('boom'))],
        'caption',
      ),
      AiBusyError,
    );
  });

  it('throws a plain error when every provider fails for other reasons', async () => {
    await assert.rejects(extractPlaces([fake('gemini', new Error('boom'))], 'caption'), (e) => {
      assert.ok(!(e instanceof AiBusyError));
      assert.match((e as Error).message, /boom/);
      return true;
    });
  });
});

describe('parseExtraction', () => {
  it('accepts JSON that matches the schema', () => {
    assert.deepEqual(parseExtraction(JSON.stringify({ places: [RAMIRO] }), 'gemini'), [RAMIRO]);
  });

  it('rejects empty, non-JSON and off-schema replies', () => {
    for (const reply of [undefined, '', 'not json', '{"places":[{"name":"X","category":"pizza"}]}']) {
      assert.throws(() => parseExtraction(reply, 'gemini'), ProviderError, String(reply));
    }
  });
});

describe('configuredExtractors', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('keeps the requested order and skips providers without a key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.GEMINI_API_KEY = 'test';
    process.env.GROQ_API_KEY = 'test';
    assert.deepEqual(
      configuredExtractors('groq, gemini, claude, unknown').map((p) => p.name),
      ['groq', 'gemini'],
    );
  });

  it('returns nothing when no key is set', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    assert.deepEqual(configuredExtractors(), []);
  });
});
