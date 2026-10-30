import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
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

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
