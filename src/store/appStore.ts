import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PlaceSchema, TripSchema, type NewPlace, type Place, type Trip } from '@/domain/models';
import { planTrip } from '@/features/trips/planner';
import { newId } from '@/shared/lib/id';
import { logger } from '@/shared/lib/logger';

/**
 * Local-first app state. AsyncStorage maps to SQLite-backed storage on Android,
 * files on iOS and localStorage on web, so one store works on every platform.
 *
 * Persisted data is versioned and validated on load: a bad record is dropped
 * (and logged) instead of crashing the app.
 */

export interface AppState {
  places: Place[];
  trips: Trip[];
  onboarded: boolean;
  /** Local entitlement flag. Replace with the billing provider's entitlement before launch. */
  isPro: boolean;
}

export interface AppActions {
  addPlaces: (places: NewPlace[]) => string[];
  updatePlace: (id: string, patch: Partial<Omit<Place, 'id'>>) => void;
  removePlace: (id: string) => void;
  toggleVisited: (id: string) => void;
  createTrip: (input: { name: string; city: string; placeIds: string[]; days: number }) => string;
  replanTrip: (id: string) => void;
  removeTrip: (id: string) => void;
  completeOnboarding: () => void;
  setPro: (isPro: boolean) => void;
  reset: () => void;
}

export type AppStore = AppState & AppActions;

const initialState: AppState = { places: [], trips: [], onboarded: false, isPro: false };

/** Two saves of the same name within ~150 m are the same place. */
function isSamePlace(a: Pick<Place, 'name' | 'lat' | 'lng'>, b: Pick<Place, 'name' | 'lat' | 'lng'>) {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    Math.abs(a.lat - b.lat) < 0.0015 &&
    Math.abs(a.lng - b.lng) < 0.0015
  );
}

export const STORE_VERSION = 1;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addPlaces: (incoming) => {
        const existing = get().places;
        const ids: string[] = [];
        const fresh: Place[] = [];
        for (const p of incoming) {
          const dupe = [...fresh, ...existing].find((e) => isSamePlace(e, p));
          if (dupe) {
            ids.push(dupe.id);
            continue;
          }
          const place: Place = { ...p, id: newId(), savedAt: Date.now() };
          fresh.push(place);
          ids.push(place.id);
        }
        if (fresh.length) set({ places: [...fresh, ...existing] });
        return ids;
      },

      updatePlace: (id, patch) =>
        set({ places: get().places.map((p) => (p.id === id ? { ...p, ...patch } : p)) }),

      removePlace: (id) =>
        set({
          places: get().places.filter((p) => p.id !== id),
          trips: get().trips.map((t) => ({
            ...t,
            days: t.days.map((d) => ({ ...d, placeIds: d.placeIds.filter((pid) => pid !== id) })),
          })),
        }),

      toggleVisited: (id) =>
        set({
          places: get().places.map((p) =>
            p.id === id ? { ...p, visitedAt: p.visitedAt ? undefined : Date.now() } : p,
          ),
        }),

      createTrip: ({ name, city, placeIds, days }) => {
        const wanted = new Set(placeIds);
        const chosen = get().places.filter((p) => wanted.has(p.id));
        const trip: Trip = { id: newId(), name, city, days: planTrip(chosen, days), createdAt: Date.now() };
        set({ trips: [trip, ...get().trips] });
        return trip.id;
      },

      replanTrip: (id) => {
        const trip = get().trips.find((t) => t.id === id);
        if (!trip) return;
        const ids = new Set(trip.days.flatMap((d) => d.placeIds));
        const places = get().places.filter((p) => ids.has(p.id));
        set({
          trips: get().trips.map((t) => (t.id === id ? { ...t, days: planTrip(places, t.days.length) } : t)),
        });
      },

      removeTrip: (id) => set({ trips: get().trips.filter((t) => t.id !== id) }),
      completeOnboarding: () => set({ onboarded: true }),
      setPro: (isPro) => set({ isPro }),
      reset: () => set(initialState),
    }),
    {
      // Keep the original key so existing installs keep their data.
      name: 'travyy-store-v1',
      version: STORE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ places, trips, onboarded, isPro }) => ({ places, trips, onboarded, isPro }),
      migrate: (persisted) => persisted as AppState,
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

/** Validate persisted state record by record. Exported for tests. */
export function sanitize(raw: unknown): Partial<AppState> {
  if (!raw || typeof raw !== 'object') return {};
  const state = raw as Record<string, unknown>;
  const keep = <T>(items: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }) => {
    if (!Array.isArray(items)) return [];
    const valid: T[] = [];
    for (const item of items) {
      const result = schema.safeParse(item);
      if (result.success) valid.push(result.data as T);
      else logger.warn('Dropped invalid persisted record', { item });
    }
    return valid;
  };
  return {
    places: keep<Place>(state.places, PlaceSchema),
    trips: keep<Trip>(state.trips, TripSchema),
    onboarded: state.onboarded === true,
    isPro: state.isPro === true,
  };
}

export const hydration = {
  isHydrated: () => useAppStore.persist.hasHydrated(),
  subscribe: (cb: () => void) => useAppStore.persist.onFinishHydration(cb),
};
