import type { Place, Trip } from '@/domain/models';

/**
 * Plain-text itinerary with map links: works in any chat app, no install needed. With `link`, the
 * message leads to the same trip on a map, where friends can add it to their own Travyy.
 */
export function tripAsText(trip: Trip, byId: ReadonlyMap<string, Place>, link?: string): string {
  const days = trip.days.map((d) => {
    const lines = d.placeIds
      .map((pid) => byId.get(pid))
      .filter((p): p is Place => !!p)
      .map((p, i) => `${i + 1}. ${p.name} — https://maps.google.com/?q=${p.lat},${p.lng}`);
    return `Day ${d.day}\n${lines.join('\n')}`;
  });
  const count = trip.days.length;
  return [
    `${trip.name} — ${count} day${count === 1 ? '' : 's'} in ${trip.city}`,
    ...(link ? [`See it on a map and add it to your trip:\n${link}`] : []),
    ...days,
    'Planned with Travyy',
  ].join('\n\n');
}
