import { describe, expect, it } from '@jest/globals';
import { cityOffers, placeOffers } from '../offers';

describe('placeOffers', () => {
  it('offers tickets for sights, activities and nature', () => {
    for (const category of ['sight', 'activity', 'nature'] as const) {
      const [offer] = placeOffers({ name: 'Torre de Belém', city: 'Lisbon', category });
      expect(offer.kind).toBe('tickets');
      expect(offer.url).toBe('https://www.getyourguide.com/s/?q=Torre%20de%20Bel%C3%A9m%2C%20Lisbon');
    }
  });

  it('offers prices for stays', () => {
    const [offer] = placeOffers(
      { name: 'Hotel & Spa', city: 'Kyoto', category: 'stay' },
      { bookingAid: '123' },
    );
    expect(offer.partner).toBe('booking');
    expect(offer.url).toBe(
      'https://www.booking.com/searchresults.html?ss=Hotel%20%26%20Spa%2C%20Kyoto&aid=123',
    );
  });

  it('offers nothing where there is nothing to book', () => {
    for (const category of ['food', 'cafe', 'nightlife', 'shopping', 'other'] as const) {
      expect(placeOffers({ name: 'Ramiro', city: 'Lisbon', category })).toEqual([]);
    }
  });

  it('adds the partner id only when there is one', () => {
    const place = { name: 'Fushimi Inari', category: 'sight' } as const;
    expect(placeOffers(place)[0].url).not.toContain('partner_id');
    expect(placeOffers(place, { gygPartnerId: 'ABC' })[0].url).toBe(
      'https://www.getyourguide.com/s/?q=Fushimi%20Inari&partner_id=ABC&utm_medium=online_publisher',
    );
  });
});

describe('cityOffers', () => {
  it('offers stays and activities for a city', () => {
    expect(cityOffers('Lisbon').map((o) => o.kind)).toEqual(['city_stays', 'city_activities']);
  });

  it('offers nothing without a city', () => {
    expect(cityOffers('  ')).toEqual([]);
  });
});
