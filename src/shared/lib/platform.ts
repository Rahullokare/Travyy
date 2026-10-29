import * as Haptics from 'expo-haptics';
import { Alert, Linking, Platform, Share } from 'react-native';
import type { LatLng } from '@/domain/models';
import { logger } from './logger';

/**
 * Cross-platform wrappers. React Native's Alert and Share are no-ops or limited on web,
 * so every confirm/share/haptic call goes through here instead of the RN APIs directly.
 */

export function confirm(options: {
  title: string;
  message?: string;
  confirmText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: options.confirmText ?? 'OK',
        style: options.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert([title, message].filter(Boolean).join('\n\n'));
    return;
  }
  Alert.alert(title, message);
}

export async function shareText(text: string, title?: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text });
      } else {
        await navigator.clipboard.writeText(text);
        notify('Copied to clipboard', 'Paste it anywhere to share your trip.');
      }
      return;
    }
    await Share.share({ message: text, title });
  } catch (error) {
    // User cancelling the share sheet lands here too; only log unexpected failures.
    if (!(error instanceof Error && error.name === 'AbortError')) logger.error(error, { where: 'shareText' });
  }
}

export const haptics = {
  selection() {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (Platform.OS !== 'web')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};

export function openUrl(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url).catch((error) => logger.error(error, { where: 'openUrl', url }));
}

/** Hand navigation off to the user's maps app; we organise, they already have a great navigator. */
export function openInMaps(place: LatLng & { name: string }) {
  const label = encodeURIComponent(place.name);
  const google = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  if (Platform.OS === 'web') return openUrl(google);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${label}&ll=${place.lat},${place.lng}`
      : `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${label})`;
  Linking.openURL(url).catch(() => openUrl(google));
}

export function openWalkingDirections(stops: LatLng[]) {
  if (stops.length === 0) return;
  const destination = stops[stops.length - 1];
  // Google Maps URLs support up to 9 waypoints.
  const waypoints = stops
    .slice(0, -1)
    .slice(0, 9)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  openUrl(
    `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${destination.lat},${destination.lng}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''),
  );
}
