import { useEffect } from 'react';
import { AppState } from 'react-native';
import { env } from '@/shared/config/env';
import { fetchWithTimeout } from './http';

const MIN_INTERVAL_MS = 5 * 60_000;
let lastPing = 0;

/** Fire-and-forget request that wakes a sleeping API (free hosting sleeps when idle). */
export function warmUpApi() {
  if (!env.apiUrl || Date.now() - lastPing < MIN_INTERVAL_MS) return;
  lastPing = Date.now();
  fetchWithTimeout(`${env.apiUrl}/health`, { timeoutMs: 90_000 }).catch(() => {});
}

/**
 * Free hosting (Render) puts the API to sleep after ~15 idle minutes and takes 30–60 s
 * to wake. Pinging on launch and on return to the foreground means it's usually awake
 * by the time someone finishes sharing a reel.
 */
export function useWarmUpApi() {
  useEffect(() => {
    warmUpApi();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') warmUpApi();
    });
    return () => sub.remove();
  }, []);
}
