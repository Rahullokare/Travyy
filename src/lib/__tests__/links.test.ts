import { describe, expect, it } from '@jest/globals';
import { detectPlatform, extractUrl, parseGoogleMapsUrl } from '../links';

describe('extractUrl', () => {
  it('pulls the link out of shared text', () => {
    expect(extractUrl('Check this out! https://www.instagram.com/reel/abc123/?igsh=xyz.')).toBe(
      'https://www.instagram.com/reel/abc123/?igsh=xyz',
    );
  });
  it('returns undefined without a link', () => {
    expect(extractUrl('no link here')).toBeUndefined();
  });
});

describe('detectPlatform', () => {
  it.each([
    ['https://www.instagram.com/reel/abc/', 'instagram'],
    ['https://vm.tiktok.com/ZM123/', 'tiktok'],
    ['https://youtu.be/xyz', 'youtube'],
    ['https://maps.app.goo.gl/abc', 'google_maps'],
    ['https://www.google.com/maps/place/Ichiran', 'google_maps'],
    ['https://example.com/blog', 'web'],
    ['not a url', 'manual'],
  ])('%s → %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe('parseGoogleMapsUrl', () => {
  it('reads name and precise pin coordinates', () => {
    const info = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Time+Out+Market+Lisboa/@38.7069,-9.1459,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d38.70695!4d-9.14588',
    );
    expect(info.name).toBe('Time Out Market Lisboa');
    expect(info.lat).toBeCloseTo(38.70695);
    expect(info.lng).toBeCloseTo(-9.14588);
  });
  it('reads q= coordinates', () => {
    expect(parseGoogleMapsUrl('https://maps.google.com/?q=35.0116,135.7681')).toEqual({ lat: 35.0116, lng: 135.7681 });
  });
  it('reads q= names', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=Nishiki+Market').name).toBe('Nishiki Market');
  });
});
