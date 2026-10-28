import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { planTrip } from './planner';
import type { Place, Trip } from './types';

/** Free tier: enough to get hooked on one trip, Pro unlocks the rest. */
export const FREE_SAVE_LIMIT = 30;
export const FREE_TRIP_LIMIT = 1;

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface State {
  places: Place[];
  trips: Trip[];
  onboarded: boolean;
  isPro: boolean;
  /** Last clipboard link we offered to import, so we don't nag twice. */
  lastClipboardOffer?: string;

  addPlaces: (places: Omit<Place, 'id' | 'savedAt'>[]) => string[];
  updatePlace: (id: string, patch: Partial<Place>) => void;
  removePlace: (id: string) => void;
  toggleVisited: (id: string) => void;
  createTrip: (name: string, city: string, placeIds: string[], days: number) => string;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  removeTrip: (id: string) => void;
  completeOnboarding: () => void;
  setPro: (v: boolean) => void;
  setClipboardOffer: (url: string) => void;
  resetAll: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      places: [],
      trips: [],
      onboarded: false,
      isPro: false,

      addPlaces: (incoming) => {
        const existing = get().places;
        const ids: string[] = [];
        const fresh: Place[] = [];
        for (const p of incoming) {
          // Same name within ~150 m is the same place — don't duplicate it.
          const dupe = existing.find(
            (e) =>
              e.name.toLowerCase() === p.name.toLowerCase() &&
              Math.abs(e.lat - p.lat) < 0.0015 &&
              Math.abs(e.lng - p.lng) < 0.0015,
          );
          if (dupe) {
            ids.push(dupe.id);
            continue;
          }
          const place: Place = { ...p, id: newId(), savedAt: Date.now() };
          fresh.push(place);
          ids.push(place.id);
        }
        set({ places: [...fresh, ...existing] });
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
      createTrip: (name, city, placeIds, dayCount) => {
        const chosen = get().places.filter((p) => placeIds.includes(p.id));
        const trip: Trip = { id: newId(), name, city, days: planTrip(chosen, dayCount), createdAt: Date.now() };
        set({ trips: [trip, ...get().trips] });
        return trip.id;
      },
      updateTrip: (id, patch) => set({ trips: get().trips.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeTrip: (id) => set({ trips: get().trips.filter((t) => t.id !== id) }),
      completeOnboarding: () => set({ onboarded: true }),
      setPro: (v) => set({ isPro: v }),
      setClipboardOffer: (url) => set({ lastClipboardOffer: url }),
      resetAll: () => set({ places: [], trips: [], onboarded: false, isPro: false, lastClipboardOffer: undefined }),
    }),
    {
      name: 'travyy-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function cityOf(p: Place): string {
  return p.city?.trim() || 'Somewhere';
}

/** Places grouped by city, biggest collections first. */
export function groupByCity(places: Place[]): { city: string; country?: string; places: Place[] }[] {
  const map = new Map<string, { city: string; country?: string; places: Place[] }>();
  for (const p of places) {
    const key = cityOf(p).toLowerCase();
    const g = map.get(key) ?? { city: cityOf(p), country: p.country, places: [] };
    g.places.push(p);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.places.length - a.places.length);
}
