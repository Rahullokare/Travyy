import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Photos found for saved places, kept on this phone only. A photo is looked up, never typed in,
 * so it isn't part of `Place` and doesn't sync: another phone finds the same one itself.
 * "Nothing found" is remembered too, so a café with no photo isn't searched on every scroll.
 */
const PhotoSchema = z.object({
  /** Image URL; absent when the lookup found nothing that's clearly this place. */
  url: z.string().url().optional(),
  /** The Wikipedia article it came from, for the credit line. */
  page: z.string().optional(),
  checkedAt: z.number(),
});
export type PlacePhoto = z.infer<typeof PhotoSchema>;

/** Keys are place name + rounded position (see photoKey), so a renamed or moved place looks again. */
const MAX_ENTRIES = 3000;

interface PhotoStore {
  photos: Record<string, PlacePhoto>;
  savePhoto: (key: string, photo: Omit<PlacePhoto, 'checkedAt'>) => void;
}

export const usePhotoStore = create<PhotoStore>()(
  persist(
    (set, get) => ({
      photos: {},
      savePhoto: (key, photo) => {
        let photos = { ...get().photos, [key]: { ...photo, checkedAt: Date.now() } };
        const keys = Object.keys(photos);
        if (keys.length > MAX_ENTRIES) {
          // Oldest lookups go first; they're the cheapest to redo.
          const keep = keys.sort((a, b) => photos[b].checkedAt - photos[a].checkedAt).slice(0, MAX_ENTRIES);
          photos = Object.fromEntries(keep.map((k) => [k, photos[k]]));
        }
        set({ photos });
      },
    }),
    {
      name: 'travyy-photos-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ photos: s.photos }),
      // Storage is a trust boundary: entries that don't parse are dropped, not crashed on.
      merge: (persisted, current) => {
        const raw = (persisted as { photos?: unknown } | undefined)?.photos;
        const photos: Record<string, PlacePhoto> = {};
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            const ok = PhotoSchema.safeParse(v);
            if (ok.success) photos[k] = ok.data;
          }
        }
        return { ...current, photos };
      },
    },
  ),
);
