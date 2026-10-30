import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { extractPlaces } from '@/features/capture/api/extract';
import { pingApi, resetApiStatus } from '@/shared/lib/apiStatus';

// This suite runs with a Travyy API configured.
jest.mock('@/shared/config/env', () => ({
  env: {
    apiUrl: 'https://api.travyy.test',
    mapStyleUrl: 'https://tiles.test/style.json',
    appVariant: 'development',
  },
}));

type FetchMock = jest.MockedFunction<typeof fetch>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const REEL = 'https://www.instagram.com/reel/C9xYz/';

let fetchMock: FetchMock;
beforeEach(async () => {
  resetApiStatus();
  await AsyncStorage.clear();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  fetchMock = jest.fn() as FetchMock;
  globalThis.fetch = fetchMock;
});
afterEach(() => {
  jest.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.finally(() => (done = true)).catch(() => {});
  while (!done) await jest.advanceTimersByTimeAsync(1200);
  return promise;
}

const calledUrls = () => fetchMock.mock.calls.map(([u]) => String(u));

describe('extractPlaces with the Travyy API', () => {
  it('lets the server read the Instagram caption and extract places', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/extract')) {
        expect(JSON.parse(String(init?.body))).toEqual({ url: REEL });
        return json({
          caption: '📍 Cervejaria Ramiro, Lisbon',
          places: [{ name: 'Cervejaria Ramiro', category: 'food', lat: 38.72, lng: -9.13, confidence: 0.9 }],
        });
      }
      throw new Error(`unexpected ${String(input)}`);
    });
    const result = await run(extractPlaces({ url: REEL }));
    expect(result).toMatchObject({
      engine: 'ai',
      platform: 'instagram',
      caption: '📍 Cervejaria Ramiro, Lisbon',
    });
    expect(result.candidates[0].name).toBe('Cervejaria Ramiro');
  });

  it('sends the cover image and location tag the phone read to /extract', async () => {
    const embed = `<script>{"shortcode_media":{"display_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/cover.jpg","location":{"id":"1","name":"Cervejaria Ramiro"},"edge_media_to_caption":{"edges":[{"node":{"text":"Best seafood in town"}}]}}}</script>`;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/embed/captioned/')) return new Response(embed);
      if (url.endsWith('/extract')) {
        expect(JSON.parse(String(init?.body))).toEqual({
          url: REEL,
          text: 'Best seafood in town\n\n📍 Cervejaria Ramiro',
          imageUrl: 'https://scontent.cdninstagram.com/v/cover.jpg',
        });
        return json({ caption: 'Best seafood in town', places: [] });
      }
      throw new Error(`unexpected ${url}`);
    });
    const result = await run(extractPlaces({ url: REEL }));
    expect(result.engine).toBe('ai');
  });

  it('falls back to /caption + on-device rules when AI extraction fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/extract')) return json({ error: 'AI extraction failed' }, 502);
      if (url.endsWith('/caption'))
        return json({ caption: '📍 Cervejaria Ramiro, Lisbon', source: 'embed-html' });
      if (url.includes('nominatim'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro' }]);
      throw new Error(`unexpected ${url}`);
    });
    const result = await run(extractPlaces({ url: REEL }));
    expect(result.engine).toBe('rules');
    expect(result.candidates[0]).toMatchObject({ name: 'Cervejaria Ramiro', lat: 38.7206 });
    expect(calledUrls().filter((u) => u.endsWith('/caption'))).toHaveLength(1);
  });

  it('asks for the caption at most once and degrades to "no places" when the server is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const result = await run(extractPlaces({ url: REEL }));
    expect(result).toMatchObject({ platform: 'instagram', candidates: [] });
    expect(calledUrls().filter((u) => u.endsWith('/caption'))).toHaveLength(1);
  });

  it('stops calling /extract once the server answers that it has no AI', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/extract')) return json({ error: 'AI extraction is not configured' }, 503);
      if (url.endsWith('/caption'))
        return json({ caption: '📍 Cervejaria Ramiro, Lisbon', source: 'embed-html' });
      if (url.includes('nominatim'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro' }]);
      throw new Error(`unexpected ${url}`);
    });
    await run(extractPlaces({ url: REEL }));
    const second = await run(extractPlaces({ url: REEL }));
    expect(second.candidates[0]).toMatchObject({ name: 'Cervejaria Ramiro' });
    expect(calledUrls().filter((u) => u.endsWith('/extract'))).toHaveLength(1);
    expect(await AsyncStorage.getItem('travyy.api.ai')).toBe('false');
  });

  it('uses a caption read on the phone without waiting on a server that has no AI', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return json({ ok: true, ai: false });
      if (url.endsWith('/embed/captioned/'))
        return new Response('<div class="Caption">📍 Cervejaria Ramiro, Lisbon</div>');
      if (url.includes('nominatim'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro' }]);
      throw new Error(`unexpected ${url}`);
    });
    await pingApi();
    const result = await run(extractPlaces({ url: REEL }));
    expect(result).toMatchObject({ engine: 'rules', caption: '📍 Cervejaria Ramiro, Lisbon' });
    expect(calledUrls().some((u) => u.endsWith('/extract') || u.endsWith('/caption'))).toBe(false);
  });

  it('does not ask the server for a caption the user already pasted', async () => {
    const caption = 'Lisbon food guide 🇵🇹 ' + 'x'.repeat(200) + '\n📍 Cervejaria Ramiro, Lisbon';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/extract')) return json({ error: 'down' }, 502);
      if (url.includes('nominatim')) return json([]);
      throw new Error(`unexpected ${url}`);
    });
    await run(extractPlaces({ url: REEL, text: caption }));
    expect(calledUrls().some((u) => u.endsWith('/caption'))).toBe(false);
  });
});
