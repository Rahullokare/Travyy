import { describe, expect, it } from '@jest/globals';
import { guessCategory } from '@/features/places/categories';
import { guessCityFromHashtags, parseCaption } from '@/features/capture/parseCaption';

describe('parseCaption', () => {
  it('takes the category from the name, not the review text around it', () => {
    const caption = `After 11 years across Thailand, here's my honest review 🇹🇭
📍 Koh Kood: 8.5/10 A proper hidden gem. Food options are limited so eat local or at your hotel
📍 Koh Chang: 7/10 Can feel a bit chaotic depending on where you stay
📍 Railay Beach: 9/10 Best food in Krabi`;
    const byName = Object.fromEntries(parseCaption(caption).candidates.map((c) => [c.name, c.category]));
    expect(byName['Railay Beach']).toBe('nature');
    // No hint in the name: the text is the fallback until the geocoder says what the place is.
    expect(byName['Koh Kood']).toBe('food');
  });

  it('extracts pinned, numbered and labelled places', () => {
    const caption = `5 spots you NEED in Lisbon 🇵🇹
1. Time Out Market - go hungry
2) Pastéis de Belém: the original custard tart
📍 Cervejaria Ramiro, Lisbon
Location: LX Factory
Follow for more! Link in bio
#lisbon #lisbontravel #portugal #travel`;
    const { candidates, cityHint } = parseCaption(caption);
    const names = candidates.map((c) => c.name);
    expect(cityHint).toBe('Lisbon');
    expect(names).toEqual(
      expect.arrayContaining(['Time Out Market', 'Pastéis de Belém', 'Cervejaria Ramiro', 'LX Factory']),
    );
    expect(names).not.toContain('Follow for more! Link in bio');
    const ramiro = candidates.find((c) => c.name === 'Cervejaria Ramiro')!;
    expect(ramiro.city).toBe('Lisbon');
    expect(ramiro.confidence).toBeGreaterThan(0.8);
  });

  it('turns venue handles into low-confidence candidates', () => {
    const { candidates } = parseCaption('Best matcha in town at @cafe_kitsune_tokyo ☕️');
    expect(candidates[0]).toMatchObject({ name: 'Cafe Kitsune Tokyo' });
    expect(candidates[0].confidence).toBeLessThan(0.5);
  });

  it('dedupes repeated mentions', () => {
    const { candidates } = parseCaption('📍 Nishiki Market\n1. Nishiki Market');
    expect(candidates).toHaveLength(1);
  });

  it('returns nothing for a caption without places', () => {
    expect(parseCaption('what a day!! #fyp #travel').candidates).toHaveLength(0);
  });
});

describe('guessCityFromHashtags', () => {
  it('strips common suffixes and ignores generic tags', () => {
    expect(guessCityFromHashtags('#tokyofood #tokyotravel #japan #fyp #travel')).toBe('Tokyo');
  });
});

describe('guessCategory', () => {
  it.each([
    ['Ichiran Ramen', 'food'],
    ['Cervejaria Ramiro', 'food'],
    ['Osteria Francescana', 'food'],
    ['Blue Bottle Coffee', 'cafe'],
    ['Fushimi Inari shrine', 'sight'],
    ['Bar High Five cocktails', 'nightlife'],
    ['Arashiyama bamboo forest', 'nature'],
    ['Somewhere', 'other'],
  ])('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat);
  });
});
