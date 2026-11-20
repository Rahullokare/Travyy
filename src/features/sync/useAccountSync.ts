import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/features/auth/supabase';
import { logger } from '@/shared/lib/logger';
import { useAppStore } from '@/store';
import { supabasePlaces, supabaseSharedVaults, supabaseVaults } from './supabaseRemote';
import { syncPlaces } from './syncPlaces';
import { syncSharedVaults } from './syncSharedVaults';
import { syncVaults } from './syncVaults';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'other-account';

/** What the profile screen shows. Not saved: it describes this run of the app. */
export const useSyncStatus = create<{ status: SyncStatus; lastSyncedAt?: number }>()(() => ({
  status: 'idle',
}));

let running = false;
let again = false;

/** One sync at a time. A request made while one is running causes one more round afterwards. */
export async function syncNow(): Promise<void> {
  if (!supabase) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return useSyncStatus.setState({ status: 'idle' });
      useSyncStatus.setState({ status: 'syncing' });
      const outcome = await syncPlaces(supabasePlaces(supabase), userId);
      // After places: a vault arriving from another phone can then find the spots it names.
      if (outcome.status === 'synced') {
        await syncVaults(supabaseVaults(supabase, userId));
        await syncSharedVaults(supabaseSharedVaults(supabase, userId));
      }
      useSyncStatus.setState(
        outcome.status === 'synced'
          ? { status: 'synced', lastSyncedAt: Date.now() }
          : { status: 'other-account' },
      );
    } while (again);
  } catch (error) {
    // Offline, or the server is having a moment. Nothing is lost: the changes stay queued.
    logger.warn('Sync failed; will retry', { error: String(error) });
    useSyncStatus.setState({ status: 'error' });
  } finally {
    running = false;
  }
}

const DEBOUNCE_MS = 2_000;
const FOREGROUND_INTERVAL_MS = 30_000;

/**
 * Keeps the signed-in account's backup current: on sign-in, shortly after any change to a saved
 * place, and when the app comes back to the front (to pick up changes from another phone).
 * Does nothing when signed out or when the build has no Supabase project.
 */
export function useAccountSync(ready: boolean) {
  const userId = useSession()?.user.id;

  useEffect(() => {
    if (!ready || !userId) return;
    void syncNow();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const offStore = useAppStore.subscribe((state, previous) => {
      if (
        state.sync.dirty === previous.sync.dirty &&
        state.sync.deleted === previous.sync.deleted &&
        state.vaultSync.dirty === previous.vaultSync.dirty &&
        state.vaultSync.deleted === previous.vaultSync.deleted
      ) {
        return;
      }
      const pending = (q: { dirty: Record<string, number>; deleted: string[] }) =>
        Object.keys(q.dirty).length > 0 || q.deleted.length > 0;
      if (!pending(state.sync) && !pending(state.vaultSync)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
    });

    let lastForeground = Date.now();
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || Date.now() - lastForeground < FOREGROUND_INTERVAL_MS) return;
      lastForeground = Date.now();
      void syncNow();
    });

    return () => {
      clearTimeout(timer);
      offStore();
      appState.remove();
    };
  }, [ready, userId]);
}
