import type { Place } from '@/domain/models';
import type { MapMarker } from '@/shared/map';
import { CATEGORY_META } from './categories';

const VISITED_COLOR = '#22945F';

export function placeToMarker(place: Place, selected = false): MapMarker {
  const meta = CATEGORY_META[place.category];
  return {
    id: place.id,
    coordinate: { lat: place.lat, lng: place.lng },
    color: place.visitedAt ? VISITED_COLOR : meta.color,
    icon: place.visitedAt ? 'checkmark' : meta.icon,
    selected,
    accessibilityLabel: `${place.name}, ${meta.label}${place.visitedAt ? ', visited' : ''}`,
  };
}
