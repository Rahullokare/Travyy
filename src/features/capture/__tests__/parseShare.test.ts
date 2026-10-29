import { describe, expect, it } from '@jest/globals';
import { canonicalizeUrl } from '@/features/capture/links';
import { cleanSharedText, sharedContentFromPayloads } from '@/features/capture/share/parseShare';

describe('sharedContentFromPayloads', () => {
  it('Instagram: URL only, tracking params stripped', () => {
    expect(
      sharedContentFromPayloads([
        { value: 'https://www.instagram.com/reel/C9xYz/?igsh=MWQ1ZGUxMzBkMA==', shareType: 'url' },
      ]),
    ).toEqual({ url: 'https://www.instagram.com/reel/C9xYz/' });
  });

  it('TikTok: link inside share boilerplate yields just the link', () => {
    expect(
      sharedContentFromPayloads([
        {
          value: "Check out @lisbon.eats's video! #TikTok https://vm.tiktok.com/ZMh1abc/",
          shareType: 'text',
        },
      ]),
    ).toEqual({ url: 'https://vm.tiktok.com/ZMh1abc/' });
  });

  it('Google Maps: keeps the place name next to the link', () => {
    expect(
      sharedContentFromPayloads([
        { value: 'Time Out Market Lisboa\nhttps://maps.app.goo.gl/AbC123', shareType: 'text' },
      ]),
    ).toEqual({ url: 'https://maps.app.goo.gl/AbC123', text: 'Time Out Market Lisboa' });
  });

  it('iOS Safari: separate URL and title items', () => {
    expect(
      sharedContentFromPayloads([
        { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking', shareType: 'url' },
        { value: '10 hidden gems in Kyoto', shareType: 'text' },
      ]),
    ).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', text: '10 hidden gems in Kyoto' });
  });

  it('a copied caption arrives as text only', () => {
    const caption = '📍 Cervejaria Ramiro, Lisbon\n1. Time Out Market';
    expect(sharedContentFromPayloads([{ value: caption, shareType: 'text' }])).toEqual({ text: caption });
  });

  it('ignores files and empty shares', () => {
    expect(sharedContentFromPayloads([])).toBeNull();
    expect(sharedContentFromPayloads([{ value: 'file:///tmp/a.jpg', shareType: 'image' }])).toBeNull();
    expect(sharedContentFromPayloads([{ value: '   ', shareType: 'text' }])).toBeNull();
  });
});

describe('cleanSharedText', () => {
  it('removes share-sheet boilerplate but keeps real text', () => {
    expect(cleanSharedText('Check out this video on TikTok! #tiktok')).toBeUndefined();
    expect(cleanSharedText('Best pastéis in Belém #reels')).toBe('Best pastéis in Belém');
  });
});

describe('canonicalizeUrl', () => {
  it('drops tracking params and keeps content params', () => {
    expect(canonicalizeUrl('https://youtu.be/abc?si=x&t=42')).toBe('https://youtu.be/abc?t=42');
    expect(canonicalizeUrl('https://www.tiktok.com/@a/video/1?is_from_webapp=1&sender_device=pc')).toBe(
      'https://www.tiktok.com/@a/video/1',
    );
    expect(canonicalizeUrl('https://example.com/p?utm_source=x&id=7')).toBe('https://example.com/p?id=7');
  });

  it('leaves invalid input untouched', () => {
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
});
