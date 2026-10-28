import { Linking, Platform } from 'react-native';
import type { Place } from './types';

/** Hand off navigation to the user's maps app — we organise, they already have a great navigator. */
export function openInMaps(place: Pick<Place, 'name' | 'lat' | 'lng'>) {
  const label = encodeURIComponent(place.name);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${label}&ll=${place.lat},${place.lng}`
      : `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${label})`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`),
  );
}

export function openDirections(stops: Pick<Place, 'lat' | 'lng'>[]) {
  if (stops.length === 0) return;
  const dest = stops[stops.length - 1];
  const waypoints = stops
    .slice(0, -1)
    .slice(0, 8)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  const url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${dest.lat},${dest.lng}${
    waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
  }`;
  Linking.openURL(url);
}
