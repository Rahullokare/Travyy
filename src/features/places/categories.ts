import { CATEGORIES, type Category } from '@/domain/models';
import type { IconName } from '@/shared/ui';

export { CATEGORIES };

/**
 * One hue per category, matched in saturation so a list of mixed spots reads as one palette.
 * Each is legible as an icon on its own 12% tint and as a white-icon map pin.
 */
export const CATEGORY_META: Record<Category, { label: string; icon: IconName; color: string }> = {
  food: { label: 'Food', icon: 'fast-food', color: '#E0532A' },
  cafe: { label: 'Café', icon: 'cafe', color: '#9A6236' },
  nightlife: { label: 'Nightlife', icon: 'wine', color: '#7B5BE0' },
  sight: { label: 'Sights', icon: 'camera', color: '#2F6FE0' },
  nature: { label: 'Nature', icon: 'leaf', color: '#22945F' },
  stay: { label: 'Stays', icon: 'bed', color: '#C98A0C' },
  shopping: { label: 'Shopping', icon: 'bag-handle', color: '#D2457E' },
  activity: { label: 'Activities', icon: 'ticket', color: '#11948A' },
  other: { label: 'Other', icon: 'location', color: '#6B7280' },
};

const KEYWORDS: [Category, RegExp][] = [
  ['cafe', /\b(caf[eé]|coffee|espresso|latte|matcha|bakery|brunch|patisserie|pastry)\b/i],
  ['nightlife', /\b(bar|pub|cocktails?|speakeasy|club|rooftop bar|wine bar|izakaya|brewery)\b/i],
  [
    'food',
    /\b(restaurant|eat|eats|food|ramen|sushi|pizza|tacos?|burgers?|bistro|trattoria|street food|market hall|dumplings?|noodles?|bbq|diner|brasserie|tasca|cervejaria|marisqueira|ristorante|osteria|pizzeria|taqueria|churrascaria)\b/i,
  ],
  ['stay', /\b(hotel|hostel|resort|airbnb|villa|ryokan|guesthouse|stay)\b/i],
  [
    'nature',
    /\b(beach|hike|hiking|trail|waterfall|lake|mountain|park|garden|viewpoint|canyon|island|cove|forest|national park)\b/i,
  ],
  ['shopping', /\b(shop|shopping|boutique|store|flea market|mall|vintage)\b/i],
  ['activity', /\b(tour|class|workshop|museum pass|kayak|surf|dive|onsen|spa|show|concert|tickets?)\b/i],
  [
    'sight',
    /\b(museum|temple|shrine|cathedral|church|castle|palace|tower|monument|bridge|square|gallery|old town|landmark|plaza)\b/i,
  ],
];

export function guessCategory(text: string): Category {
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
  return 'other';
}
