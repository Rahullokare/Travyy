import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { extractPlaces } from '@/features/capture/api/extract';

type FetchMock = jest.MockedFunction<typeof fetch>;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

let fetchMock: FetchMock;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  fetchMock = jest.fn() as FetchMock;
  globalThis.fetch = fetchMock;
});
afterEach(() => {
  jest.useRealTimers();
});

/** Geocoder calls are throttled to 1/s, so advance fake timers while awaiting. */
async function run<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.finally(() => (done = true)).catch(() => {});
  while (!done) await jest.advanceTimersByTimeAsync(1200);
  return promise;
}

describe('extractPlaces', () => {
  it('parses Google Maps links without calling the AI or geocoding search', async () => {
    fetchMock.mockResolvedValue(
      json({
        lat: '38.70695',
        lon: '-9.14588',
        display_name: 'Time Out Market, Lisboa',
        address: { city: 'Lisbon', country: 'Portugal' },
      }),
    );
    const result = await run(
      extractPlaces({
        url: 'https://www.google.com/maps/place/Time+Out+Market/@38.7069,-9.1459,17z/data=!3d38.70695!4d-9.14588',
      }),
    );
    expect(result.engine).toBe('maps-link');
    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: 'Time Out Market',
        lat: 38.70695,
        lng: -9.14588,
        city: 'Lisbon',
        country: 'Portugal',
      }),
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/reverse?');
  });

  it('extracts candidates from a caption and geocodes them', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('Ramiro'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro, Lisbon' }]);
      return json([]);
    });
    const result = await run(extractPlaces({ text: '📍 Cervejaria Ramiro, Lisbon\n📍 Nowhere Real Café' }));
    expect(result.engine).toBe('rules');
    const ramiro = result.candidates.find((c) => c.name === 'Cervejaria Ramiro');
    expect(ramiro).toMatchObject({ lat: 38.7206, lng: -9.1357, city: 'Lisbon' });
    const missing = result.candidates.find((c) => c.name === 'Nowhere Real Café');
    expect(missing?.lat).toBeUndefined();
    expect(missing!.confidence).toBeLessThan(0.5);
  });

  it('treats a short bare name as a place search', async () => {
    fetchMock.mockResolvedValue(
      json([{ lat: '35.66', lon: '139.70', display_name: 'Ichiran, Shibuya, Tokyo' }]),
    );
    const result = await run(extractPlaces({ text: 'Ichiran Shibuya' }));
    expect(result.engine).toBe('search');
    expect(result.candidates[0]).toMatchObject({ name: 'Ichiran', lat: 35.66 });
  });

  it('still fetches the real caption when a share adds boilerplate text', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://www.tiktok.com/oembed')) {
        return json({ title: 'Lisbon eats 🇵🇹\n📍 Cervejaria Ramiro, Lisbon #lisbon' });
      }
      if (url.includes('Ramiro'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro' }]);
      return json([]);
    });
    const result = await run(
      extractPlaces({ url: 'https://www.tiktok.com/@lisbon.eats/video/123', text: 'Check out this video' }),
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('tiktok.com/oembed'))).toBe(true);
    expect(result.candidates[0]).toMatchObject({ name: 'Cervejaria Ramiro', lat: 38.7206 });
  });

  it('reads an Instagram caption from the embed page on the phone', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://www.instagram.com/p/C9xYz-Ab/embed/captioned/') {
        return new Response(
          '<div class="Caption"><a class="CaptionUsername" href="#">lisbon.eats</a><br />Dinner tonight 🦐<br />📍 Cervejaria Ramiro, Lisbon</div><div class="Footer"></div>',
        );
      }
      if (url.includes('Ramiro'))
        return json([{ lat: '38.7206', lon: '-9.1357', display_name: 'Cervejaria Ramiro' }]);
      return json([]);
    });
    const result = await run(extractPlaces({ url: 'https://www.instagram.com/reel/C9xYz-Ab/?igsh=MWQ1' }));
    expect(result).toMatchObject({ platform: 'instagram', engine: 'rules' });
    expect(result.caption).toContain('📍 Cervejaria Ramiro, Lisbon');
    expect(result.caption).not.toContain('lisbon.eats');
    expect(result.candidates[0]).toMatchObject({ name: 'Cervejaria Ramiro', lat: 38.7206 });
  });

  it('falls back to searching the place name when a Maps short link cannot be resolved', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('maps.app.goo.gl')) throw new TypeError('Network request failed');
      return json([{ lat: '38.7069', lon: '-9.1459', display_name: 'Time Out Market Lisboa, Lisbon' }]);
    });
    const result = await run(
      extractPlaces({ url: 'https://maps.app.goo.gl/AbC123', text: 'Time Out Market Lisboa' }),
    );
    expect(result.engine).toBe('search');
    expect(result.candidates[0]).toMatchObject({ name: 'Time Out Market Lisboa', lat: 38.7069 });
  });

  it('returns no candidates when there is nothing to read', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    const result = await run(extractPlaces({ url: 'https://www.instagram.com/reel/abc/' }));
    expect(result).toMatchObject({ platform: 'instagram', candidates: [] });
  });
});
