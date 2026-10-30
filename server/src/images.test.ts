import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchImage, isTrustedImageHost, type Fetcher } from './images.ts';

const respond =
  (body: BodyInit | null, headers: Record<string, string>, status = 200): Fetcher =>
  async () =>
    new Response(body, { status, headers });

describe('isTrustedImageHost', () => {
  it('accepts Instagram, TikTok and YouTube CDNs over HTTPS', () => {
    for (const url of [
      'https://scontent-lis1-1.cdninstagram.com/v/t51/cover.jpg?stp=x',
      'https://instagram.flis5-1.fna.fbcdn.net/v/cover.jpg',
      'https://p16-sign-va.tiktokcdn.com/obj/cover.jpeg',
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    ]) {
      assert.ok(isTrustedImageHost(url), url);
    }
  });

  it('rejects other hosts, look-alikes and plain HTTP', () => {
    for (const url of [
      'https://example.com/cover.jpg',
      'https://evilcdninstagram.com/cover.jpg',
      'http://scontent.cdninstagram.com/cover.jpg',
      'http://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      assert.ok(!isTrustedImageHost(url), url);
    }
  });
});

describe('fetchImage', () => {
  it('returns a small JPEG as base64 with its type', async () => {
    const image = await fetchImage(
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      respond('hello', { 'content-type': 'image/jpeg; charset=binary' }),
    );
    assert.deepEqual(image, { mimeType: 'image/jpeg', data: 'aGVsbG8=' });
  });

  it('ignores non-images, errors, oversize files and HTTP URLs', async () => {
    const url = 'https://i.ytimg.com/vi/abc/hqdefault.jpg';
    assert.equal(await fetchImage(url, respond('<html>', { 'content-type': 'text/html' })), undefined);
    assert.equal(await fetchImage(url, respond('x', { 'content-type': 'image/jpeg' }, 404)), undefined);
    assert.equal(await fetchImage(url, respond('x', { 'content-type': 'image/svg+xml' })), undefined);
    assert.equal(
      await fetchImage(url, respond('x', { 'content-type': 'image/png', 'content-length': '99999999' })),
      undefined,
    );
    assert.equal(
      await fetchImage(url, respond(new Uint8Array(5 * 1024 * 1024), { 'content-type': 'image/png' })),
      undefined,
    );
    assert.equal(
      await fetchImage('http://i.ytimg.com/x.jpg', respond('x', { 'content-type': 'image/jpeg' })),
      undefined,
    );
    const failing: Fetcher = async () => {
      throw new Error('network');
    };
    assert.equal(await fetchImage(url, failing), undefined);
  });
});
