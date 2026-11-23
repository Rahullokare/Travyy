import { describe, expect, it } from '@jest/globals';
import { photoKey, pickPhotoPage } from '../photos';

const img = (name: string) => ({
  thumbnail: { source: `https://upload.wikimedia.org/${name}.jpg` },
  pageimage: `${name}.jpg`,
});
const at = (lat: number, lon: number) => ({ coordinates: [{ lat, lon }] });

// Shapes taken from real Wikipedia search answers (2026-11-23).
describe('pickPhotoPage', () => {
  it('takes the top hit when it is nearby and names the place in other words', () => {
    const page = pickPhotoPage({ name: 'Torre de Belém', lat: 38.6916, lng: -9.216 }, [
      { title: 'Belém Tower', index: 1, ...at(38.69166, -9.21611), ...img('tower') },
      { title: 'Belém, Lisbon', index: 2, ...at(38.699, -9.209), ...img('area') },
    ]);
    expect(page?.title).toBe('Belém Tower');
  });

  it('never borrows a neighbour’s photo: a nearby top hit with no word in common is refused', () => {
    expect(
      pickPhotoPage({ name: 'Kala Ghoda Cafe', lat: 18.9277, lng: 72.8321 }, [
        { title: 'Jehangir Art Gallery', index: 1, ...at(18.92745, 72.8317), ...img('gallery') },
      ]),
    ).toBeUndefined();
  });

  it('refuses the neighbourhood when the venue itself has no article', () => {
    expect(
      pickPhotoPage({ name: 'Pastéis de Belém', lat: 38.6975, lng: -9.2032 }, [
        { title: 'Pastel de nata', index: 1, ...img('tart') },
        { title: 'Belém, Lisbon', index: 2, ...at(38.699, -9.209), ...img('area') },
      ]),
    ).toBeUndefined();
  });

  it('refuses a same-named place in another town', () => {
    expect(
      pickPhotoPage({ name: 'Kiyomizu-dera', lat: 33.15, lng: 130.52 }, [
        { title: 'Kiyomizu-dera', index: 1, ...at(34.995, 135.785), ...img('kyoto') },
      ]),
    ).toBeUndefined();
  });

  it('accepts an exact title a few km off (an island’s article sits at its centre) and skips logos', () => {
    const island = { name: 'Koh Tao', lat: 10.07, lng: 99.81 };
    expect(
      pickPhotoPage(island, [
        {
          title: 'Koh Tao',
          index: 1,
          ...at(10.1, 99.83),
          thumbnail: { source: 'https://x/Flag.svg.png' },
          pageimage: 'Flag.svg',
        },
      ]),
    ).toBeUndefined();
    expect(
      pickPhotoPage(island, [{ title: 'Koh Tao', index: 1, ...at(10.1, 99.83), ...img('island') }])?.title,
    ).toBe('Koh Tao');
  });
});

describe('photoKey', () => {
  it('ignores accents and case, and changes when the place moves', () => {
    expect(photoKey({ name: 'Café Nur', lat: 18.9, lng: 72.8 })).toBe(
      photoKey({ name: 'cafe nur', lat: 18.9, lng: 72.8 }),
    );
    expect(photoKey({ name: 'Café Nur', lat: 18.9, lng: 72.8 })).not.toBe(
      photoKey({ name: 'Café Nur', lat: 19, lng: 72.8 }),
    );
  });
});
