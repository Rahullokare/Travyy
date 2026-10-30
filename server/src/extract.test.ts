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
  type MediaLoaders,
} from './extract.ts';
import type { ImageData, VideoData } from './media.ts';

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
  video = false,
): Fake {
  return {
    name,
    vision,
    video,
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
  const CLIP: VideoData = { mimeType: 'video/mp4', data: 'dmlkZW8=' };
  const REEL_VIDEO = 'https://scontent.cdninstagram.com/v/reel.mp4';
  const SHORT = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';

  function loaders(
    image: ImageData | undefined,
    video: VideoData | undefined = undefined,
    videoEnabled = true,
  ) {
    const calls: string[] = [];
    const media: MediaLoaders = {
      image: async (url) => (calls.push(url), image),
      video: async (url) => (calls.push(url), video),
      videoEnabled,
    };
    return { calls, media };
  }

  it('sends a weak caption together with the cover image', async () => {
    const gemini = fake('gemini', [RAMIRO]);
    const { calls, media } = loaders(IMAGE);
    const result = await extractFromPost([gemini], { caption: 'Lisbon 🇵🇹', imageUrl: COVER }, media);
    assert.deepEqual(calls, [COVER]);
    assert.equal(gemini.inputs.length, 1);
    assert.equal(gemini.inputs[0].image, IMAGE);
    assert.equal(result.media, 'image');
  });

  it('works from the image alone when there is no caption', async () => {
    const gemini = fake('gemini', [RAMIRO]);
    const result = await extractFromPost([gemini], { caption: '', imageUrl: COVER }, loaders(IMAGE).media);
    assert.deepEqual(result.places, [RAMIRO]);
    assert.equal(gemini.inputs[0].caption, '');
  });

  it('returns nothing without asking the AI when there is neither caption nor readable media', async () => {
    const gemini = fake('gemini', [RAMIRO], true, true);
    const result = await extractFromPost(
      [gemini],
      { caption: '', imageUrl: COVER, videoUrl: REEL_VIDEO },
      loaders(undefined).media,
    );
    assert.deepEqual(result.places, []);
    assert.equal(gemini.inputs.length, 0);
  });

  it('does not download media for a full caption that finds places', async () => {
    assert.ok(LONG_CAPTION.length >= WEAK_CAPTION);
    const gemini = fake('gemini', [RAMIRO], true, true);
    const { calls, media } = loaders(IMAGE, CLIP);
    const result = await extractFromPost(
      [gemini],
      { caption: LONG_CAPTION, imageUrl: COVER, videoUrl: REEL_VIDEO },
      media,
    );
    assert.deepEqual(calls, []);
    assert.equal(result.media, 'none');
  });

  it('retries a full caption with the image when the text alone finds nothing', async () => {
    const gemini = fake('gemini', (input) => (input.image ? [RAMIRO] : []));
    const result = await extractFromPost(
      [gemini],
      { caption: LONG_CAPTION, imageUrl: COVER },
      loaders(IMAGE).media,
    );
    assert.equal(gemini.inputs.length, 2);
    assert.deepEqual(result.places, [RAMIRO]);
    assert.equal(result.media, 'image');
  });

  it('keeps the text-only answer when a full caption finds nothing and there is no media', async () => {
    const gemini = fake('gemini', []);
    const result = await extractFromPost([gemini], { caption: LONG_CAPTION }, loaders(undefined).media);
    assert.equal(gemini.inputs.length, 1);
    assert.equal(result.provider, 'gemini');
  });

  it('skips the image when no configured provider can read it', async () => {
    const groq = fake('groq', [RAMIRO], false);
    const { calls, media } = loaders(IMAGE);
    await extractFromPost([groq], { caption: 'Lisbon', imageUrl: COVER }, media);
    assert.deepEqual(calls, []);
  });

  it('lets a video provider watch a YouTube link directly, before the cover', async () => {
    const gemini = fake('gemini', [RAMIRO], true, true);
    const groq = fake('groq', [], false);
    const { calls, media } = loaders(IMAGE);
    const result = await extractFromPost(
      [groq, gemini],
      { caption: 'Lisbon in 60 seconds', url: SHORT, imageUrl: COVER },
      media,
    );
    assert.deepEqual(gemini.inputs[0].video, { youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(groq.inputs.length, 0);
    assert.deepEqual(calls, []);
    assert.equal(result.media, 'video');
    assert.deepEqual(result.places, [RAMIRO]);
  });

  it('downloads a reel clip and sends it to the video provider', async () => {
    const gemini = fake('gemini', [RAMIRO], true, true);
    const { calls, media } = loaders(IMAGE, CLIP);
    const result = await extractFromPost(
      [gemini],
      { caption: '', videoUrl: REEL_VIDEO, imageUrl: COVER },
      media,
    );
    assert.deepEqual(calls, [REEL_VIDEO]);
    assert.equal(gemini.inputs[0].video, CLIP);
    assert.equal(result.media, 'video');
  });

  it('falls back to the cover when watching the video fails', async () => {
    const gemini = fake(
      'gemini',
      (input) => {
        if (input.video) throw new ProviderError('gemini: HTTP 400');
        return [RAMIRO];
      },
      true,
      true,
    );
    const result = await extractFromPost(
      [gemini],
      { caption: 'Lisbon', url: SHORT, imageUrl: COVER },
      loaders(IMAGE).media,
    );
    assert.equal(result.media, 'image');
    assert.deepEqual(result.places, [RAMIRO]);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].message, /HTTP 400/);
  });

  it('never sends video when video extraction is switched off', async () => {
    const gemini = fake('gemini', [RAMIRO], true, true);
    await extractFromPost([gemini], { caption: 'Lisbon', url: SHORT }, loaders(undefined, CLIP, false).media);
    assert.equal(gemini.inputs[0].video, undefined);
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
