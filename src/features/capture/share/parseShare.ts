import { canonicalizeUrl, extractUrl } from '../links';

/** The subset of expo-sharing's SharePayload we rely on (kept local so this stays pure and testable). */
export interface IncomingPayload {
  value: string;
  shareType: string;
  mimeType?: string;
}

export interface SharedContent {
  url?: string;
  text?: string;
}

// Text that apps prepend to shared links. It carries no place information and would
// otherwise stop us from fetching the real caption.
const BOILERPLATE = [
  /check out (?:this|@?[\w.]+(?:'s)?)\s+(?:video|reel|post|short)\b(?:\s+on\s+(?:tiktok|instagram|youtube))?[!.]?/gi,
  /\b(?:watch|see) (?:this|more)[^\n]*?on (?:tiktok|instagram|youtube)[!.]?/gi,
  /\bshared (?:via|from) [\w ]+/gi,
  /#(?:tiktok|instagram|youtube|reels?|shorts)\b/gi,
];

export function cleanSharedText(text: string): string | undefined {
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, ' ');
  out = out
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return out.length >= 3 ? out : undefined;
}

/**
 * Turn what the OS hands us (iOS share extension / Android SEND intent) into a link
 * plus optional caption text for the capture flow.
 *
 *  - Instagram/YouTube usually share just a URL.
 *  - TikTok and Google Maps share text that contains the URL ("Place name\nhttps://…").
 *  - Copied captions arrive as plain text.
 */
export function sharedContentFromPayloads(payloads: IncomingPayload[]): SharedContent | null {
  const urls: string[] = [];
  const texts: string[] = [];
  for (const p of payloads) {
    const value = p.value?.trim();
    if (!value) continue;
    if (p.shareType === 'url') urls.push(value);
    else if (p.shareType === 'text') texts.push(value);
  }
  const joined = texts.join('\n');
  const rawUrl = urls[0] ?? extractUrl(joined);
  const url = rawUrl ? canonicalizeUrl(rawUrl) : undefined;
  const text = cleanSharedText(rawUrl ? joined.split(rawUrl).join(' ') : joined);
  if (!url && !text) return null;
  return { ...(url ? { url } : {}), ...(text ? { text } : {}) };
}
