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
  /** The same map at night, so a dark app doesn't open onto a bright white map. */
  mapStyleUrlDark: z.url().default('https://tiles.openfreemap.org/styles/dark'),
  /** Supabase project for accounts. Optional: without it the app has no sign-in. The anon key is public. */
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
  /** Where the web app is hosted, for trip links shared from a phone. On web the page's own origin is used. */
  webUrl: z.url().optional(),
  /** Partner IDs for booking links. Optional: links work without them, without commission. */
  gygPartnerId: z.string().min(1).optional(),
  bookingAid: z.string().min(1).optional(),
  /** PostHog project key (public by design). Optional: without it analytics only logs in development. */
  posthogKey: z.string().min(1).optional(),
  posthogHost: z.url().default('https://us.i.posthog.com'),
  appVariant: z.enum(['development', 'preview', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

function readEnv(): Env {
  const parsed = EnvSchema.safeParse({
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || undefined,
    mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL || undefined,
    mapStyleUrlDark: process.env.EXPO_PUBLIC_MAP_STYLE_URL_DARK || undefined,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || undefined,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '') || undefined,
    gygPartnerId: process.env.EXPO_PUBLIC_GYG_PARTNER_ID || undefined,
    bookingAid: process.env.EXPO_PUBLIC_BOOKING_AID || undefined,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || undefined,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST?.replace(/\/$/, '') || undefined,
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
