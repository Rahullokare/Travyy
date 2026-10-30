import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchImage, fetchVideo, isTrustedMediaHost, youtubeWatchUrl, type Fetcher } from './media.ts';

const respond =
  (body: BodyInit | null, headers: Record<string, string>, status = 200): Fetcher =>
  async () =>
    new Response(body, { status, headers });

describe('isTrustedMediaHost', () => {
  it('accepts Instagram, TikTok and YouTube CDNs over HTTPS', () => {
    for (const url of [
      'https://scontent-lis1-1.cdninstagram.com/v/t51/cover.jpg?stp=x',
      'https://instagram.flis5-1.fna.fbcdn.net/v/cover.jpg',
      'https://p16-sign-va.tiktokcdn.com/obj/cover.jpeg',
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    ]) {
      assert.ok(isTrustedMediaHost(url), url);
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
      assert.ok(!isTrustedMediaHost(url), url);
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

describe('youtubeWatchUrl', () => {
  it('turns watch, short, youtu.be, mobile and live links into a watch URL', () => {
    const watch = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/live/dQw4w9WgXcQ?feature=share',
    ]) {
      assert.equal(youtubeWatchUrl(url), watch, url);
    }
  });

  it('ignores channels, playlists, bad ids and other sites', () => {
    for (const url of [
      'https://www.youtube.com/@lisboneats',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/watch?v=short',
      'https://www.tiktok.com/@a/video/1',
      'not a url',
    ]) {
      assert.equal(youtubeWatchUrl(url), undefined, url);
    }
  });
});

describe('fetchVideo', () => {
  const url = 'https://scontent.cdninstagram.com/v/reel.mp4';

  it('returns a small MP4 as base64', async () => {
    assert.deepEqual(await fetchVideo(url, respond('video', { 'content-type': 'video/mp4' })), {
      mimeType: 'video/mp4',
      data: 'dmlkZW8=',
    });
  });

  it('ignores non-video responses and clips over the size limit', async () => {
    assert.equal(await fetchVideo(url, respond('x', { 'content-type': 'image/jpeg' })), undefined);
    assert.equal(
      await fetchVideo(
        url,
        respond('x', { 'content-type': 'video/mp4', 'content-length': String(50 * 1024 * 1024) }),
      ),
      undefined,
    );
  });
});
