import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '@/domain/models';

type Status = 'idle' | 'loading' | 'denied' | 'ready' | 'unavailable';

/**
 * Foreground location only. We ask in context ("show what's near me"), never on launch;
 * if permission was already granted we use it silently.
 */
export function useUserLocation() {
  const [location, setLocation] = useState<LatLng>();
  const [status, setStatus] = useState<Status>('idle');

  const locate = useCallback(async (ask: boolean): Promise<LatLng | undefined> => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      let granted = current.granted;
      if (!granted && ask && current.canAskAgain) {
        granted = (await Location.requestForegroundPermissionsAsync()).granted;
      }
      if (!granted) {
        if (ask) setStatus('denied');
        return undefined;
      }
      setStatus('loading');
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) setLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(next);
      setStatus('ready');
      return next;
    } catch {
      setStatus('unavailable');
      return undefined;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (!cancelled && p.granted) locate(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const request = useCallback(() => locate(true), [locate]);
  return { location, status, request };
}
