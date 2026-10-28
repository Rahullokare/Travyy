import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from './types';

/** Foreground location only — we ask in context ("show what's near me"), never on launch. */
export function useUserLocation(autoRequest = false) {
  const [location, setLocation] = useState<LatLng>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'denied' | 'ready'>('idle');

  const refresh = useCallback(async (ask: boolean) => {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;
    if (!granted && ask && current.canAskAgain) {
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
    }
    if (!granted) {
      setStatus(ask ? 'denied' : 'idle');
      return undefined;
    }
    setStatus('loading');
    const last = await Location.getLastKnownPositionAsync();
    if (last) setLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setLocation(loc);
    setStatus('ready');
    return loc;
  }, []);

  useEffect(() => {
    // Silently use location if the user already granted it.
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted || autoRequest ? refresh(autoRequest) : undefined))
      .catch(() => setStatus('idle'));
  }, [autoRequest, refresh]);

  return { location, status, request: () => refresh(true).catch(() => undefined) };
}
