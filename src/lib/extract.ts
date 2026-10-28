import { detectPlatform, parseGoogleMapsUrl } from './links';
import { parseCaption } from './parseCaption';
import { guessCategory } from './categories';
import type { Candidate, SourcePlatform } from './types';

/**
 * Optional AI backend (see /server). When unset the app runs fully on-device:
 * captions are parsed with rules and geocoded with OpenStreetMap Nominatim.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

const USER_AGENT = 'Travyy/1.0 (travel saves app)';

export interface ExtractionResult {
  platform: SourcePlatform;
  caption?: string;
  candidates: Candidate[];
  /** Which engine produced the result — shown to the user for transparency. */
  engine: 'ai' | 'rules' | 'maps-link';
}

export async function extractFromInput(input: { url?: string; text?: string }): Promise<ExtractionResult> {
  const platform = input.url ? detectPlatform(input.url) : 'manual';

  if (input.url && platform === 'google_maps') {
    return { platform, candidates: await fromMapsLink(input.url), engine: 'maps-link' };
  }

  const fetched = input.url && !input.text ? await fetchCaption(input.url, platform) : undefined;
  const caption = [input.text, fetched].filter(Boolean).join('\n').trim() || undefined;

  if (API_URL) {
    try {
      const candidates = await extractViaApi(input.url, caption);
      return { platform, caption, candidates, engine: 'ai' };
    } catch (e) {
      console.warn('AI extraction failed, using on-device rules', e);
    }
  }

  if (!caption) return { platform, caption, candidates: [], engine: 'rules' };
  const { candidates, cityHint } = parseCaption(caption);
  const geocoded = await geocodeAll(candidates.slice(0, 12), cityHint);
  return { platform, caption, candidates: geocoded, engine: 'rules' };
}

async function extractViaApi(url: string | undefined, text: string | undefined): Promise<Candidate[]> {
  const res = await fetchWithTimeout(`${API_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, text }),
  }, 45_000);
  if (!res.ok) throw new Error(`extract ${res.status}`);
  const json = (await res.json()) as { places: Candidate[] };
  return json.places;
}

/** Best-effort public caption lookup. Instagram usually needs a login, so users can paste the caption instead. */
export async function fetchCaption(url: string, platform: SourcePlatform): Promise<string | undefined> {
  try {
    if (platform === 'tiktok') {
      const r = await fetchWithTimeout(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (r.ok) return ((await r.json()) as { title?: string }).title;
    }
    if (platform === 'youtube') {
      const r = await fetchWithTimeout(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (r.ok) return ((await r.json()) as { title?: string }).title;
    }
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!r.ok) return undefined;
    const html = await r.text();
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1];
    const desc = meta('og:description') ?? meta('description');
    const title = meta('og:title');
    const text = [title, desc].filter(Boolean).map((s) => decodeEntities(s!)).join('\n');
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function fromMapsLink(url: string): Promise<Candidate[]> {
  let full = url;
  if (/goo\.gl/.test(url)) {
    try {
      const r = await fetchWithTimeout(url, { method: 'GET' });
      full = r.url || url;
    } catch {
      // keep the short link; parsing below will mostly fail and we fall back to manual entry
    }
  }
  const info = parseGoogleMapsUrl(full);
  if (!info.name && info.lat === undefined) return [];
  const name = info.name ?? 'Dropped pin';
  if (info.lat !== undefined && info.lng !== undefined) {
    const rev = await reverseGeocode(info.lat, info.lng);
    return [{ name, lat: info.lat, lng: info.lng, city: rev?.city, country: rev?.country, address: rev?.address, category: guessCategory(name), confidence: 0.95 }];
  }
  const [hit] = await geocodeAll([{ name, category: guessCategory(name), confidence: 0.9 }]);
  return hit ? [hit] : [];
}

// ---- Geocoding (OpenStreetMap Nominatim, max ~1 req/s per usage policy) ----

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  category?: string;
  address?: { city?: string; town?: string; village?: string; suburb?: string; country?: string };
}

let lastCall = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
}

export async function geocodeAll(candidates: Candidate[], cityHint?: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (c.lat !== undefined && c.lng !== undefined) {
      out.push(c);
      continue;
    }
    const q = [c.name, c.city ?? cityHint, c.country].filter(Boolean).join(', ');
    try {
      const r = await politeFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
      );
      const [hit] = r.ok ? ((await r.json()) as NominatimHit[]) : [];
      if (hit) {
        out.push({
          ...c,
          lat: parseFloat(hit.lat),
          lng: parseFloat(hit.lon),
          address: hit.display_name,
          city: c.city ?? cityOf(hit.address) ?? cityHint,
          country: c.country ?? hit.address?.country,
        });
        continue;
      }
    } catch {
      // network error: keep the candidate without coordinates so the user can fix it
    }
    out.push({ ...c, city: c.city ?? cityHint, confidence: c.confidence * 0.5 });
  }
  return out;
}

export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<Candidate[]> {
  const viewbox = near
    ? `&viewbox=${near.lng - 0.3},${near.lat + 0.3},${near.lng + 0.3},${near.lat - 0.3}`
    : '';
  const r = await politeFetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8${viewbox}&q=${encodeURIComponent(query)}`,
  );
  if (!r.ok) return [];
  const hits = (await r.json()) as NominatimHit[];
  return hits.map((h) => ({
    name: h.display_name.split(',')[0],
    lat: parseFloat(h.lat),
    lng: parseFloat(h.lon),
    address: h.display_name,
    city: cityOf(h.address),
    country: h.address?.country,
    category: guessCategory(`${h.display_name} ${h.type ?? ''} ${h.category ?? ''}`),
    confidence: 0.9,
  }));
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const r = await politeFetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
    );
    if (!r.ok) return undefined;
    const hit = (await r.json()) as NominatimHit;
    return { city: cityOf(hit.address), country: hit.address?.country, address: hit.display_name };
  } catch {
    return undefined;
  }
}

function cityOf(a: NominatimHit['address']): string | undefined {
  return a?.city ?? a?.town ?? a?.village ?? a?.suburb;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
