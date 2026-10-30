import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ProviderError,
  parseExtraction,
  type ExtractedPlace,
  type ExtractionInput,
  type PlaceExtractor,
} from './ai/shared.ts';
import {
  AiBusyError,
  WEAK_CAPTION,
  configuredExtractors,
  extractFromPost,
  extractPlaces,
} from './extract.ts';
import type { ImageData } from './images.ts';

const RAMIRO: ExtractedPlace = {
  name: 'Cervejaria Ramiro',
  city: 'Lisbon',
  country: 'Portugal',
  category: 'food',
  confidence: 0.9,
};
const IMAGE: ImageData = { mimeType: 'image/jpeg', data: 'aGVsbG8=' };
const COVER = 'https://scontent.cdninstagram.com/v/cover.jpg';
const LONG_CAPTION = 'Weekend in Lisbon, no names here, just vibes. '.repeat(6);

type Fake = PlaceExtractor & { inputs: ExtractionInput[] };

function fake(
  name: string,
  result: ExtractedPlace[] | Error | ((input: ExtractionInput) => ExtractedPlace[]),
  vision = true,
): Fake {
  return {
    name,
    vision,
    inputs: [],
    async extract(input) {
      this.inputs.push(input);
      if (result instanceof Error) throw result;
      return typeof result === 'function' ? result(input) : result;
    },
  };
}

describe('extractPlaces', () => {
  it('uses the first provider that answers and reports earlier failures', async () => {
    const first = fake('gemini', new ProviderError('gemini: HTTP 500'));
    const second = fake('groq', [RAMIRO]);
    const third = fake('claude', []);
    const result = await extractPlaces([first, second, third], { caption: 'caption' });
    assert.equal(result.provider, 'groq');
    assert.deepEqual(result.places, [RAMIRO]);
    assert.deepEqual(result.failures, [{ provider: 'gemini', message: 'gemini: HTTP 500' }]);
    assert.equal(third.inputs.length, 0);
  });

  it('treats an empty list as an answer, not a failure', async () => {
    const first = fake('gemini', []);
    const second = fake('groq', [RAMIRO]);
    const result = await extractPlaces([first, second], { caption: 'no places here' });
    assert.equal(result.provider, 'gemini');
    assert.deepEqual(result.places, []);
    assert.equal(second.inputs.length, 0);
  });

  it('drops one-character names', async () => {
    const result = await extractPlaces([fake('gemini', [{ ...RAMIRO, name: ' x ' }, RAMIRO])], {
      caption: 'caption',
    });
    assert.deepEqual(result.places, [RAMIRO]);
  });

  it('sends text-only providers the caption without the image', async () => {
    const gemini = fake('gemini', new ProviderError('gemini: HTTP 429', true));
    const groq = fake('groq', [RAMIRO], false);
    await extractPlaces([gemini, groq], { caption: 'caption', image: IMAGE });
    assert.equal(gemini.inputs[0].image, IMAGE);
    assert.equal(groq.inputs[0].image, undefined);
    assert.equal(groq.inputs[0].caption, 'caption');
  });

  it('skips text-only providers when there is only an image', async () => {
    const groq = fake('groq', [RAMIRO], false);
    const claude = fake('claude', [RAMIRO]);
    const result = await extractPlaces([groq, claude], { caption: '', image: IMAGE });
    assert.equal(result.provider, 'claude');
    assert.equal(groq.inputs.length, 0);
  });

  it('throws AiBusyError when every provider fails and one was rate-limited', async () => {
    await assert.rejects(
      extractPlaces(
        [fake('gemini', new ProviderError('gemini: HTTP 429', true)), fake('groq', new Error('boom'))],
        { caption: 'caption' },
      ),
      AiBusyError,
    );
  });

  it('throws a plain error when every provider fails for other reasons', async () => {
    await assert.rejects(extractPlaces([fake('gemini', new Error('boom'))], { caption: 'caption' }), (e) => {
      assert.ok(!(e instanceof AiBusyError));
      assert.match((e as Error).message, /boom/);
      return true;
    });
  });
});

describe('extractFromPost', () => {
  const loader = (image: ImageData | undefined) => {
    const calls: string[] = [];
    const load = async (url: string) => {
      calls.push(url);
      return image;
    };
    return { calls, load };
  };

  it('sends a weak caption together with the cover image', async () => {
    const gemini = fake('gemini', [RAMIRO]);
    const { calls, load } = loader(IMAGE);
    const result = await extractFromPost([gemini], { caption: 'Lisbon 🇵🇹', imageUrl: COVER }, load);
    assert.deepEqual(calls, [COVER]);
    assert.equal(gemini.inputs.length, 1);
    assert.equal(gemini.inputs[0].image, IMAGE);
    assert.equal(result.usedImage, true);
  });

  it('works from the image alone when there is no caption', async () => {
    const gemini = fake('gemini', [RAMIRO]);
    const result = await extractFromPost([gemini], { caption: '', imageUrl: COVER }, loader(IMAGE).load);
    assert.deepEqual(result.places, [RAMIRO]);
    assert.equal(gemini.inputs[0].caption, '');
  });

  it('returns nothing without asking the AI when there is neither caption nor a readable image', async () => {
    const gemini = fake('gemini', [RAMIRO]);
    const result = await extractFromPost([gemini], { caption: '', imageUrl: COVER }, loader(undefined).load);
    assert.deepEqual(result.places, []);
    assert.equal(gemini.inputs.length, 0);
  });

  it('does not download the image for a full caption that finds places', async () => {
    assert.ok(LONG_CAPTION.length >= WEAK_CAPTION);
    const gemini = fake('gemini', [RAMIRO]);
    const { calls, load } = loader(IMAGE);
    const result = await extractFromPost([gemini], { caption: LONG_CAPTION, imageUrl: COVER }, load);
    assert.deepEqual(calls, []);
    assert.equal(result.usedImage, false);
  });

  it('retries a full caption with the image when the text alone finds nothing', async () => {
    const gemini = fake('gemini', (input) => (input.image ? [RAMIRO] : []));
    const result = await extractFromPost(
      [gemini],
      { caption: LONG_CAPTION, imageUrl: COVER },
      loader(IMAGE).load,
    );
    assert.equal(gemini.inputs.length, 2);
    assert.deepEqual(result.places, [RAMIRO]);
    assert.equal(result.usedImage, true);
  });

  it('skips the image when no configured provider can read it', async () => {
    const groq = fake('groq', [RAMIRO], false);
    const { calls, load } = loader(IMAGE);
    await extractFromPost([groq], { caption: 'Lisbon', imageUrl: COVER }, load);
    assert.deepEqual(calls, []);
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
