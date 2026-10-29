import type { Place, Trip } from '@/domain/models';

/** Plain-text itinerary with map links: works in any chat app, no install needed (free distribution). */
export function tripAsText(trip: Trip, byId: ReadonlyMap<string, Place>): string {
  const days = trip.days.map((d) => {
    const lines = d.placeIds
      .map((pid) => byId.get(pid))
      .filter((p): p is Place => !!p)
      .map((p, i) => `${i + 1}. ${p.name} — https://maps.google.com/?q=${p.lat},${p.lng}`);
    return `Day ${d.day}\n${lines.join('\n')}`;
  });
  return [`${trip.name} — ${trip.days.length} days in ${trip.city}`, ...days, 'Planned with Travyy'].join(
    '\n\n',
  );
}
