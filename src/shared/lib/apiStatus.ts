import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { env } from '@/shared/config/env';
import { fetchWithTimeout } from './http';

/** GET /health on the Travyy API (server/src/index.ts). Older servers don't send `ai`. */
const HealthSchema = z.object({ ok: z.boolean(), ai: z.boolean().optional() });
const STORAGE_KEY = 'travyy.api.ai';

let ai: boolean | undefined;
let restored: Promise<void> | undefined;

/**
 * Whether the API runs AI extraction: known after its first answer, and remembered across
 * launches. Lets the app skip `/extract` on a server without it (the free setup) instead of
 * waiting for a sleeping server to wake up only to answer 503.
 */
export async function apiHasAi(): Promise<boolean | undefined> {
  restored ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => {
      if (ai === undefined && (saved === 'true' || saved === 'false')) ai = saved === 'true';
    })
    .catch(() => {});
  await restored;
  return ai;
}

export function rememberApiHasAi(value: boolean) {
  ai = value;
  AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {});
}

/** Ping /health: wakes a sleeping API and records what it can do. */
export async function pingApi(): Promise<void> {
  if (!env.apiUrl) return;
  const res = await fetchWithTimeout(`${env.apiUrl}/health`, { timeoutMs: 90_000 });
  const health = HealthSchema.safeParse(await res.json());
  if (health.success && health.data.ai !== undefined) rememberApiHasAi(health.data.ai);
}

/** Test hook. */
export function resetApiStatus() {
  ai = undefined;
  restored = undefined;
}
