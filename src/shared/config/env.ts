import Constants from 'expo-constants';
import { z } from 'zod';

/**
 * Typed, validated runtime configuration.
 *
 * EXPO_PUBLIC_* values are inlined at build time, so they must be referenced as
 * literal `process.env.EXPO_PUBLIC_X` expressions (no dynamic access). Never put
 * secrets here: everything in this file ships inside the app bundle.
 */
const EnvSchema = z.object({
  /** Travyy API (see /server). Optional: without it extraction runs fully on-device. */
  apiUrl: z.url().optional(),
  /** MapLibre style for the web map. OpenFreeMap is free and needs no key. */
  mapStyleUrl: z.url().default('https://tiles.openfreemap.org/styles/liberty'),
  /** Supabase project for accounts. Optional: without it the app has no sign-in. The anon key is public. */
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
  appVariant: z.enum(['development', 'preview', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

function readEnv(): Env {
  const parsed = EnvSchema.safeParse({
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || undefined,
    mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL || undefined,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || undefined,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
    appVariant: Constants.expoConfig?.extra?.appVariant,
  });
  if (!parsed.success) {
    // Fail loudly in development, degrade to defaults in production builds.
    const message = `Invalid environment config: ${z.prettifyError(parsed.error)}`;
    if (__DEV__) throw new Error(message);
    console.error(message);
    return EnvSchema.parse({});
  }
  return parsed.data;
}

export const env = readEnv();
