import type { Category } from './types';

export const CATEGORY_META: Record<Category, { label: string; emoji: string; color: string }> = {
  food: { label: 'Food', emoji: '🍜', color: '#F0643C' },
  cafe: { label: 'Café', emoji: '☕', color: '#A0673C' },
  nightlife: { label: 'Nightlife', emoji: '🍸', color: '#8B5CF6' },
  sight: { label: 'Sights', emoji: '🏛️', color: '#2F7DF6' },
  nature: { label: 'Nature', emoji: '🌿', color: '#1FA971' },
  stay: { label: 'Stays', emoji: '🛏️', color: '#E0A100' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#E2508C' },
  activity: { label: 'Activities', emoji: '🎟️', color: '#0EA5A5' },
  other: { label: 'Other', emoji: '📍', color: '#6B7280' },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

const KEYWORDS: [Category, RegExp][] = [
  ['cafe', /\b(caf[eé]|coffee|espresso|latte|matcha|bakery|brunch|patisserie|pastry)\b/i],
  ['nightlife', /\b(bar|pub|cocktails?|speakeasy|club|rooftop bar|wine bar|izakaya|brewery)\b/i],
  ['food', /\b(restaurant|eat|eats|food|ramen|sushi|pizza|tacos?|burgers?|bistro|trattoria|street food|market hall|dumplings?|noodles?|bbq|diner|brasserie)\b/i],
  ['stay', /\b(hotel|hostel|resort|airbnb|villa|ryokan|guesthouse|stay)\b/i],
  ['nature', /\b(beach|hike|hiking|trail|waterfall|lake|mountain|park|garden|viewpoint|canyon|island|cove|forest|national park)\b/i],
  ['shopping', /\b(shop|shopping|boutique|store|flea market|mall|vintage)\b/i],
  ['activity', /\b(tour|class|workshop|museum pass|kayak|surf|dive|onsen|spa|show|concert|tickets?)\b/i],
  ['sight', /\b(museum|temple|shrine|cathedral|church|castle|palace|tower|monument|bridge|square|gallery|old town|landmark|plaza)\b/i],
];

export function guessCategory(text: string): Category {
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
  return 'other';
}
