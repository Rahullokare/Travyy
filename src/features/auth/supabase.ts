import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { env } from '@/shared/config/env';

/** SecureStore warns above 2 KB per value and a session can be larger, so it's stored in chunks. */
const CHUNK_SIZE = 1800;

/** Supabase storage adapter over the iOS Keychain / Android Keystore. */
export const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
    for (const [i, part] of parts.entries()) await SecureStore.setItemAsync(`${key}.${i}`, part);
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    for (let i = parts.length; i < previous; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

/** Undefined when the build has no Supabase project: the app then simply has no accounts. */
export const supabase: SupabaseClient | undefined =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          // On web, supabase-js keeps the session in localStorage.
          storage: Platform.OS === 'web' ? undefined : chunkedSecureStore,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : undefined;

// Refresh tokens only while the app is in front, as Supabase recommends for React Native.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
