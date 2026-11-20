import type { Category, Place } from '@/domain/models';
import type { IconName } from '@/shared/ui';

/**
 * Booking links for places the user already saved. This is how free users earn the app money:
 * a partner pays a commission when a booking follows the link (docs/RESEARCH.md, 4.2).
 *
 * Rules: only where there is something to book (never food or cafés), only for the user's own
 * saves and trips, and always labelled as partner links. Links work without partner IDs; they
 * just earn nothing.
 */
export type Partner = 'getyourguide' | 'booking';
export type OfferKind = 'tickets' | 'stay' | 'city_stays' | 'city_activities';

export interface Offer {
  kind: OfferKind;
  partner: Partner;
  partnerLabel: string;
  title: string;
  subtitle: string;
  icon: IconName;
  url: string;
}

export interface PartnerIds {
  gygPartnerId?: string;
  bookingAid?: string;
}

/** Categories where a ticket or tour is likely to exist. */
const TICKETED: ReadonlySet<Category> = new Set(['sight', 'activity', 'nature']);

function query(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

function getYourGuide(search: string, ids: PartnerIds): string {
  return `https://www.getyourguide.com/s/?${query({
    q: search,
    partner_id: ids.gygPartnerId,
    utm_medium: ids.gygPartnerId ? 'online_publisher' : undefined,
  })}`;
}

function bookingCom(search: string, ids: PartnerIds): string {
  return `https://www.booking.com/searchresults.html?${query({ ss: search, aid: ids.bookingAid })}`;
}

const withCity = (name: string, city?: string) => [name, city].filter(Boolean).join(', ');

export function placeOffers(place: Pick<Place, 'name' | 'city' | 'category'>, ids: PartnerIds = {}): Offer[] {
  if (place.category === 'stay') {
    return [
      {
        kind: 'stay',
        partner: 'booking',
        partnerLabel: 'Booking.com',
        title: 'Check prices and dates',
        subtitle: place.name,
        icon: 'bed',
        url: bookingCom(withCity(place.name, place.city), ids),
      },
    ];
  }
  if (TICKETED.has(place.category)) {
    return [
      {
        kind: 'tickets',
        partner: 'getyourguide',
        partnerLabel: 'GetYourGuide',
        title: 'Tickets and tours',
        subtitle: 'Skip the queue, or go with a guide',
        icon: 'ticket',
        url: getYourGuide(withCity(place.name, place.city), ids),
      },
    ];
  }
  return [];
}

/** For a trip: somewhere to sleep and things to do in its city. */
export function cityOffers(city: string, ids: PartnerIds = {}): Offer[] {
  const name = city.trim();
  if (!name) return [];
  return [
    {
      kind: 'city_stays',
      partner: 'booking',
      partnerLabel: 'Booking.com',
      title: `Stays in ${name}`,
      subtitle: 'Compare prices near your stops',
      icon: 'bed',
      url: bookingCom(name, ids),
    },
    {
      kind: 'city_activities',
      partner: 'getyourguide',
      partnerLabel: 'GetYourGuide',
      title: `Things to do in ${name}`,
      subtitle: 'Tours, tickets and day trips',
      icon: 'ticket',
      url: getYourGuide(name, ids),
    },
  ];
}
