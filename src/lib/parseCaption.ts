import { guessCategory } from './categories';
import type { Candidate } from './types';

/**
 * Offline, rule-based place extraction from a reel/TikTok caption.
 *
 * This is the fallback when no AI backend is configured. Travel creators use a
 * small set of conventions — "📍 Name", numbered lists, "Location:" lines and
 * venue @handles — so these rules catch most of the useful signal.
 */
export function parseCaption(caption: string): { candidates: Candidate[]; cityHint?: string } {
  const text = caption.replace(/\r/g, '');
  const cityHint = guessCityFromHashtags(text);
  const found = new Map<string, Candidate>();

  const add = (rawName: string, context: string, confidence: number, rawCity?: string) => {
    const name = cleanName(rawName);
    if (!isPlausibleName(name)) return;
    const key = name.toLowerCase();
    const city = rawCity ? cleanName(rawCity) : cityHint;
    const existing = found.get(key);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.city ??= city;
      return;
    }
    found.set(key, { name, city, category: guessCategory(`${name} ${context}`), confidence });
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 📍 Name, City   |   📍Name - description
    const pin = trimmed.match(/(?:📍|📌)\s*([^\n]+)/u);
    if (pin) {
      const [namePart, ...rest] = splitDescription(pin[1]);
      const [name, city] = splitNameCity(namePart);
      add(name, rest.join(' ') || trimmed, 0.9, city);
      continue;
    }

    // Location: Name   |   Where: Name   |   Spot: Name
    const label = trimmed.match(/^(?:location|where|spot|address|place)\s*[:\-–]\s*(.+)$/i);
    if (label) {
      const [name, city] = splitNameCity(splitDescription(label[1])[0]);
      add(name, trimmed, 0.85, city);
      continue;
    }

    // 1. Name - why it's great   |   1) Name   |   #1 Name
    const numbered = trimmed.match(/^(?:#?\d{1,2}[.)\]:]|[-•▪︎●]\s)\s*(.+)$/u);
    if (numbered) {
      const [namePart, ...rest] = splitDescription(numbered[1]);
      const [name, city] = splitNameCity(namePart);
      add(name, rest.join(' ') || trimmed, 0.7, city);
      continue;
    }

    // Emoji-led list lines: "🍜 Ichiran Shibuya"
    const emojiLead = trimmed.match(/^\p{Extended_Pictographic}️?\s*([A-Z0-9][^\n]{2,60})$/u);
    if (emojiLead) {
      const [namePart, ...rest] = splitDescription(emojiLead[1]);
      const [name, city] = splitNameCity(namePart);
      add(name, rest.join(' ') || trimmed, 0.6, city);
    }
  }

  // Venue @handles: @cafe_kitsune_tokyo → "Cafe Kitsune Tokyo". Low confidence:
  // handles are just as often other creators.
  for (const m of text.matchAll(/@([A-Za-z0-9_.]{3,30})/g)) {
    const handle = m[1].replace(/[._]+$/, '');
    if (/^(the)?(travel|explore|visit|wander|food|eats|guide)/i.test(handle) && !/(cafe|bar|hotel|restaurant)/i.test(handle)) continue;
    const name = handle.replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (found.has(name.toLowerCase())) continue;
    add(name, text, 0.35);
  }

  const candidates = [...found.values()].sort((a, b) => b.confidence - a.confidence);
  return { candidates, cityHint };
}

const GENERIC_TAGS = new Set([
  'travel', 'travelgram', 'wanderlust', 'foodie', 'instatravel', 'explore', 'reels', 'fyp',
  'foryou', 'foryoupage', 'viral', 'traveltok', 'food', 'foodtok', 'trip', 'vacation', 'holiday',
  'traveltips', 'hiddengems', 'hiddengem', 'bucketlist', 'travelblogger', 'europe', 'asia',
  'summer', 'weekend', 'datenight', 'brunch', 'coffee', 'cafe', 'reelsinstagram', 'explorepage',
]);
const TAG_SUFFIXES = /(travel|travels|food|foodie|eats|guide|tips|cafes|cafe|trip|life|gram|tok|hiddengems|bucketlist|itinerary)$/i;

/** "#lisbontravel #lisbon #portugal" → "Lisbon" (the most repeated non-generic stem). */
export function guessCityFromHashtags(text: string): string | undefined {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/#([\p{L}]{3,30})/gu)) {
    let tag = m[1].toLowerCase();
    if (GENERIC_TAGS.has(tag)) continue;
    const stem = tag.replace(TAG_SUFFIXES, '');
    if (stem.length >= 3) tag = stem;
    if (GENERIC_TAGS.has(tag)) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [tag, n] of counts) {
    if (n > bestCount) {
      best = tag;
      bestCount = n;
    }
  }
  return best ? best[0].toUpperCase() + best.slice(1) : undefined;
}

function splitDescription(s: string): string[] {
  // Split "Name — great views" / "Name: tip" / "Name | price" into [name, rest...]
  return s.split(/\s+[-–—|:]\s+|\s*[|]\s*|:\s+/).map((p) => p.trim()).filter(Boolean);
}

function splitNameCity(s: string): [string, string | undefined] {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1].length <= 30) {
    return [parts.slice(0, -1).join(', '), parts[parts.length - 1]];
  }
  return [s, undefined];
}

function cleanName(s: string): string {
  return s
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[“”"*_~]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:.,]+|[\s\-–—:.,!]+$/g, '')
    .trim();
}

const STOPWORDS = /^(link in bio|follow|save this|share|comment|like|tag|day \d+|part \d+|watch|subscribe|credit|music|sound|pov|tips?|note)\b/i;

function isPlausibleName(name: string): boolean {
  if (name.length < 3 || name.length > 60) return false;
  if (STOPWORDS.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  if (/https?:\/\//.test(name)) return false;
  // A long sentence is a description, not a venue.
  if (name.split(/\s+/).length > 7) return false;
  return /\p{L}/u.test(name);
}
