import type { SourcePlatform } from './types';

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function extractUrl(text: string): string | undefined {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[).,!?]+$/, '') : undefined;
}

export function detectPlatform(url: string): SourcePlatform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'manual';
  }
  if (host.endsWith('instagram.com') || host === 'instagr.am') return 'instagram';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    (host.includes('google.') && url.includes('/maps')) ||
    host === 'maps.google.com'
  ) {
    return 'google_maps';
  }
  return 'web';
}

export const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  google_maps: 'Google Maps',
  web: 'Web',
  manual: 'Added manually',
};

export interface MapsLinkInfo {
  name?: string;
  lat?: number;
  lng?: number;
}

/**
 * Pull a place name and/or coordinates out of a full Google Maps URL.
 * Short links (maps.app.goo.gl) must be resolved by following the redirect first.
 */
export function parseGoogleMapsUrl(url: string): MapsLinkInfo {
  const info: MapsLinkInfo = {};
  const decoded = safeDecode(url);

  // Precise pin coordinates: !3d<lat>!4d<lng>
  const pin = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  // Viewport centre: @<lat>,<lng>,<zoom>
  const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const coords = pin ?? at;
  if (coords) {
    info.lat = parseFloat(coords[1]);
    info.lng = parseFloat(coords[2]);
  }

  const place = decoded.match(/\/maps\/place\/([^/@?]+)/);
  if (place) info.name = place[1].replace(/\+/g, ' ').trim();

  let params: URLSearchParams | undefined;
  try {
    params = new URL(url).searchParams;
  } catch {
    params = undefined;
  }
  const q = params?.get('q') ?? params?.get('query') ?? undefined;
  if (q) {
    const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (ll) {
      info.lat ??= parseFloat(ll[1]);
      info.lng ??= parseFloat(ll[2]);
    } else {
      info.name ??= q.replace(/\+/g, ' ').trim();
    }
  }
  return info;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
