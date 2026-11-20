import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { env } from '@/shared/config/env';
import { supabase } from './supabase';

/** `undefined` until the saved session has been read, then the session or `null`. */
let current: Session | null | undefined = supabase ? undefined : null;
const listeners = new Set<() => void>();

supabase?.auth.onAuthStateChange((_event, session) => {
  current = session;
  for (const l of listeners) l();
});

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => current;

export const authEnabled = !!supabase;

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** `Authorization` header for the Travyy API when signed in, so limits apply per user. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    // getSession refreshes an expired access token first.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Emails a one-time code; creates the account on first sign-in. */
export async function sendEmailCode(email: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not set up in this build');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not set up in this build');
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

/**
 * Google sign-in, through Supabase in the browser (PKCE). Phones open a browser sheet that closes
 * itself when Google sends the user back to `<scheme>://auth-callback`; web leaves the page and
 * comes back to `/auth-callback`. Either way the URL carries a one-time code, swapped for a session
 * by `completeOAuth`. Needs no native Google SDK, so it works in Expo Go too.
 */
export type OAuthProvider = 'google';

const CALLBACK_PATH = 'auth-callback';
const RETURN_KEY = 'travyy-auth-return';

let providers: Promise<ReadonlySet<string>> | undefined;

/** The sign-in providers switched on in the Supabase project, so the app never offers a dead button. */
export function enabledProviders(): Promise<ReadonlySet<string>> {
  if (!supabase || !env.supabaseUrl || !env.supabaseAnonKey) return Promise.resolve(new Set());
  providers ??= fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`settings ${r.status}`))))
    .then((settings: unknown) => {
      const external = (settings as { external?: Record<string, unknown> } | null)?.external ?? {};
      return new Set(Object.keys(external).filter((k) => external[k] === true));
    })
    .catch(() => {
      // Ask again next time rather than remembering a failure.
      providers = undefined;
      return new Set<string>();
    });
  return providers;
}

export function oauthRedirectUrl(): string {
  return Platform.OS === 'web'
    ? `${window.location.origin}/${CALLBACK_PATH}`
    : Linking.createURL(CALLBACK_PATH);
}

/** Query and fragment parameters of a redirect URL. Errors can come in either. */
export function redirectParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = url.split('#');
  const query = parts[0].split('?')[1] ?? '';
  for (const piece of [query, parts[1] ?? ''].join('&').split('&')) {
    if (!piece) continue;
    const [key, ...rest] = piece.split('=');
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
    } catch {
      // A malformed piece is skipped.
    }
  }
  return out;
}

/**
 * Starts signing in with a provider. On phones it resolves `true` once signed in and `false` if
 * the user closed the sheet. On web the page navigates away; after sign-in the callback page opens
 * `returnTo` (a path in this app).
 */
export async function signInWithProvider(provider: OAuthProvider, returnTo?: string): Promise<boolean> {
  if (!supabase) throw new Error('Sign-in is not set up in this build');
  const redirectTo = oauthRedirectUrl();
  if (Platform.OS === 'web') {
    try {
      if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo);
      else sessionStorage.removeItem(RETURN_KEY);
    } catch {
      // Without storage the callback page opens the home screen.
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
    return false;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await completeOAuth(redirectParams(result.url));
  return true;
}

const exchanges = new Map<string, Promise<void>>();

/**
 * Finishes a provider sign-in from the parameters it sent back. Safe to call twice for one code:
 * on Android the redirect also opens the callback route while the browser sheet reports it.
 */
export function completeOAuth(params: Record<string, string | string[] | undefined>): Promise<void> {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const client = supabase;
  if (!client) return Promise.reject(new Error('Sign-in is not set up in this build'));
  const failure = one('error_description') ?? one('error');
  if (failure) return Promise.reject(new Error(failure));
  const code = one('code');
  if (!code) return Promise.reject(new Error('Sign-in didn’t finish. Try again.'));
  let pending = exchanges.get(code);
  if (!pending) {
    pending = client.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        exchanges.delete(code);
        throw error;
      }
    });
    exchanges.set(code, pending);
  }
  return pending;
}

/** Where web sign-in returns to: a path in this app, never another site. */
export function takeReturnPath(): string {
  let path: string | null = null;
  try {
    path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Fall through to home.
  }
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
