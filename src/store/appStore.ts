import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { countryCodeOf } from '@/domain/countries';
import {
  PlaceSchema,
  TripSchema,
  VaultSchema,
  type NewPlace,
  type Place,
  type Trip,
  type Vault,
} from '@/domain/models';
import { planTrip } from '@/features/trips/planner';
import { newId } from '@/shared/lib/id';
import { keepValid } from './keepValid';
import { useLedgerStore } from './ledgerStore';

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
  /** Vaults the person made. The country → city vault and the Liked vault are derived, never stored. */
  vaults: Vault[];
  onboarded: boolean;
  /** Entitlements, written only by `features/paywall/billing.ts`. */
  isPro: boolean;
  /** Trip Passes bought: each allows one more planned trip. */
  tripPasses: number;
  /** A Trip Pass also lifts the AI import limit until this time. */
  passUntil: number;
  /** AI imports used in `month` (YYYY-MM), for the free plan's monthly allowance. */
  aiImports: { month: string; count: number };
  /** What the account's backup hasn't heard about yet. See features/sync. */
  sync: PlaceSyncState;
  /** The same bookkeeping for vaults. The account is `sync.ownerId`. */
  vaultSync: VaultSyncState;
  /** Vaults shared with friends, by vault id. See features/sync/syncSharedVaults.ts. */
  shared: Record<string, SharedVault>;
}

/** This phone's side of a shared vault: whose it is, and which saved place is which shared spot. */
export interface SharedVault {
  role: 'owner' | 'member';
  inviteToken?: string;
  /** Local place id → `vault_spots` id. A vault place with no entry hasn't been shared yet. */
  links: Record<string, string>;
  /** Server time of the newest spot change already pulled for this vault. */
  cursor?: string;
  /** People in it, the owner included, as of the last sync. */
  people?: number;
}

/** A spot that arrived from someone else in a shared vault. */
export interface RemoteSpot {
  spotId: string;
  place: NewPlace;
}

export type VaultSyncState = Omit<PlaceSyncState, 'ownerId'>;

export interface PlaceSyncState {
  /** The account this phone's saves are backed up to. Set the first time someone signs in. */
  ownerId?: string;
  /** Server time of the newest change already pulled. */
  cursor?: string;
  /** Places changed here since the last upload: id → when, so a change made mid-upload isn't lost. */
  dirty: Record<string, number>;
  /** Places deleted here that the backup still has. */
  deleted: string[];
}

export interface AppActions {
  addPlaces: (places: NewPlace[]) => string[];
  updatePlace: (id: string, patch: Partial<Omit<Place, 'id'>>) => void;
  removePlace: (id: string) => void;
  toggleVisited: (id: string) => void;
  toggleLiked: (id: string) => void;
  createVault: (input: { name: string; emoji?: string; placeIds?: string[] }) => string;
  updateVault: (id: string, patch: { name?: string; emoji?: string }) => void;
  removeVault: (id: string) => void;
  /** Adds places to a vault (newest first). Ones already in it stay where they are. */
  addToVault: (vaultId: string, placeIds: string[]) => void;
  removeFromVault: (vaultId: string, placeIds: string[]) => void;
  /** Adds a vault someone shared as a link: its spots join your saves (reusing ones you have) and a vault of your own holds them. */
  /** Marks a vault of yours as shared, once the server has given it an invite token. */
  startSharing: (vaultId: string, inviteToken: string) => void;
  /** Adds a vault you joined by invite: same id as the owner's, no spots until the first sync. */
  joinSharedVault: (vault: { id: string; name: string; emoji?: string; createdAt: number }) => void;
  /** Leaving (a member) removes the vault here; stopping (the owner) keeps it as a private vault. */
  unshareVault: (vaultId: string) => void;
  /** After uploading: which places now have a shared spot, and which links were taken out. */
  linkSpots: (vaultId: string, linked: Record<string, string>, unlinked: string[]) => void;
  /** Spots others added or took out. Added ones join your saves (reusing ones you have). */
  applyRemoteSpots: (
    vaultId: string,
    changes: { added: RemoteSpot[]; removedSpotIds: string[]; cursor?: string },
  ) => void;
  /** Name, emoji and head count from the server. Never queued for upload. */
  applySharedInfo: (vaultId: string, info: { name?: string; emoji?: string; people?: number }) => void;
  importVault: (input: { name: string; emoji?: string; places: NewPlace[] }) => string;
  createTrip: (input: { name: string; city: string; placeIds: string[]; days: number }) => string;
  /** Adds a trip someone shared, keeping their day order. Places already saved are reused. */
  importTrip: (input: { name: string; city: string; days: NewPlace[][] }) => string;
  replanTrip: (id: string) => void;
  removeTrip: (id: string) => void;
  completeOnboarding: () => void;
  setPro: (isPro: boolean) => void;
  addTripPass: (days: number) => void;
  countAiImport: () => void;
  /** Ties this phone's saves to an account and queues all of them for upload. */
  adoptAccount: (userId: string) => void;
  /** Clears what was uploaded, unless it changed again while the upload was running. */
  markPushed: (pushed: Record<string, number>, deleted: string[]) => void;
  /** Applies changes from the backup. Anything changed here and not yet uploaded is left alone. */
  applyRemotePlaces: (changes: { upserts: Place[]; deletedIds: string[]; cursor?: string }) => void;
  markVaultsPushed: (pushed: Record<string, number>, deleted: string[]) => void;
  applyRemoteVaults: (changes: { upserts: Vault[]; deletedIds: string[]; cursor?: string }) => void;
  reset: () => void;
}

export type AppStore = AppState & AppActions;

const initialState: AppState = {
  places: [],
  trips: [],
  vaults: [],
  onboarded: false,
  isPro: false,
  tripPasses: 0,
  passUntil: 0,
  aiImports: { month: '', count: 0 },
  sync: { dirty: {}, deleted: [] },
  vaultSync: { dirty: {}, deleted: [] },
  shared: {},
};

/** Calendar month in local time, the period the free AI allowance resets on. */
export function monthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Two saves of the same name within ~150 m are the same place. */
function isSamePlace(a: Pick<Place, 'name' | 'lat' | 'lng'>, b: Pick<Place, 'name' | 'lat' | 'lng'>) {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    Math.abs(a.lat - b.lat) < 0.0015 &&
    Math.abs(a.lng - b.lng) < 0.0015
  );
}

/** Marks places (or vaults) as changed since the last upload. */
function touched<S extends VaultSyncState>(sync: S, ids: string[]): S {
  const now = Date.now();
  return { ...sync, dirty: { ...sync.dirty, ...Object.fromEntries(ids.map((id) => [id, now])) } };
}

/** Deleted places stop being "changed" and, once an account is attached, become deletions to upload. */
function forgotten(sync: PlaceSyncState, ids: string[]): PlaceSyncState {
  const gone = new Set(ids);
  return {
    ...sync,
    dirty: Object.fromEntries(Object.entries(sync.dirty).filter(([id]) => !gone.has(id))),
    deleted: sync.ownerId ? [...new Set([...sync.deleted, ...ids])] : sync.deleted,
  };
}

/** A deleted vault stops being "changed" and, once an account is attached, becomes a deletion to upload. */
function forgottenVaults(sync: VaultSyncState, ids: string[], signedIn: boolean): VaultSyncState {
  const gone = new Set(ids);
  return {
    ...sync,
    dirty: Object.fromEntries(Object.entries(sync.dirty).filter(([id]) => !gone.has(id))),
    deleted: signedIn ? [...new Set([...sync.deleted, ...ids])] : sync.deleted,
  };
}

/** Drops deleted places from every vault, and reports which vaults changed. */
function vaultsWithout(vaults: Vault[], gone: ReadonlySet<string>): { vaults: Vault[]; changed: string[] } {
  const changed: string[] = [];
  const now = Date.now();
  const next = vaults.map((v) => {
    if (!v.placeIds.some((id) => gone.has(id))) return v;
    changed.push(v.id);
    return { ...v, placeIds: v.placeIds.filter((id) => !gone.has(id)), updatedAt: now };
  });
  return { vaults: next, changed };
}

/** Clears what was uploaded, unless it changed again while the upload was running. */
function pushed<S extends VaultSyncState>(sync: S, done: Record<string, number>, deleted: string[]): S {
  const gone = new Set(deleted);
  return {
    ...sync,
    dirty: Object.fromEntries(Object.entries(sync.dirty).filter(([id, at]) => done[id] !== at)),
    deleted: sync.deleted.filter((id) => !gone.has(id)),
  };
}

function withoutPlaces(trips: Trip[], gone: ReadonlySet<string>): Trip[] {
  return trips.map((t) => ({
    ...t,
    days: t.days.map((d) => ({ ...d, placeIds: d.placeIds.filter((pid) => !gone.has(pid)) })),
  }));
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
          const place: Place = {
            ...p,
            // The AI and shared links give a name only; the code is what the vault groups by.
            countryCode: p.countryCode ?? countryCodeOf(p.country),
            id: newId(),
            savedAt: Date.now(),
          };
          fresh.push(place);
          ids.push(place.id);
        }
        if (fresh.length) {
          set({
            places: [...fresh, ...existing],
            sync: touched(
              get().sync,
              fresh.map((p) => p.id),
            ),
          });
        }
        return ids;
      },

      updatePlace: (id, patch) =>
        set({
          places: get().places.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          sync: touched(get().sync, [id]),
        }),

      removePlace: (id) => {
        const { vaults, changed } = vaultsWithout(get().vaults, new Set([id]));
        set({
          places: get().places.filter((p) => p.id !== id),
          trips: withoutPlaces(get().trips, new Set([id])),
          vaults,
          sync: forgotten(get().sync, [id]),
          vaultSync: touched(get().vaultSync, changed),
        });
      },

      toggleVisited: (id) =>
        set({
          places: get().places.map((p) =>
            p.id === id ? { ...p, visitedAt: p.visitedAt ? undefined : Date.now() } : p,
          ),
          sync: touched(get().sync, [id]),
        }),

      toggleLiked: (id) =>
        set({
          places: get().places.map((p) =>
            p.id === id ? { ...p, likedAt: p.likedAt ? undefined : Date.now() } : p,
          ),
          sync: touched(get().sync, [id]),
        }),

      createVault: ({ name, emoji, placeIds = [] }) => {
        const now = Date.now();
        const vault: Vault = {
          id: newId(),
          name: name.trim().slice(0, 60) || 'New vault',
          emoji: emoji || undefined,
          placeIds: [...new Set(placeIds)],
          createdAt: now,
          updatedAt: now,
        };
        set({ vaults: [vault, ...get().vaults], vaultSync: touched(get().vaultSync, [vault.id]) });
        return vault.id;
      },

      updateVault: (id, patch) =>
        set({
          vaults: get().vaults.map((v) =>
            v.id === id
              ? {
                  ...v,
                  ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 60) || v.name } : {}),
                  ...(patch.emoji !== undefined ? { emoji: patch.emoji || undefined } : {}),
                  updatedAt: Date.now(),
                }
              : v,
          ),
          vaultSync: touched(get().vaultSync, [id]),
        }),

      removeVault: (id) => {
        const { [id]: share, ...shared } = get().shared;
        set({
          vaults: get().vaults.filter((v) => v.id !== id),
          // Someone else's vault isn't yours to delete on the server: leaving is `unshareVault`.
          vaultSync:
            share?.role === 'member'
              ? forgottenVaults(get().vaultSync, [id], false)
              : forgottenVaults(get().vaultSync, [id], !!get().sync.ownerId),
          shared,
        });
      },

      startSharing: (vaultId, inviteToken) =>
        set({
          shared: {
            ...get().shared,
            [vaultId]: {
              links: get().shared[vaultId]?.links ?? {},
              cursor: get().shared[vaultId]?.cursor,
              role: 'owner',
              inviteToken,
            },
          },
        }),

      joinSharedVault: ({ id, name, emoji, createdAt }) => {
        if (!get().vaults.some((v) => v.id === id)) {
          const vault: Vault = { id, name, emoji, placeIds: [], createdAt, updatedAt: Date.now() };
          set({ vaults: [vault, ...get().vaults] });
        }
        if (!get().shared[id]) set({ shared: { ...get().shared, [id]: { role: 'member', links: {} } } });
      },

      unshareVault: (vaultId) => {
        const { [vaultId]: share, ...shared } = get().shared;
        if (!share) return;
        set({
          shared,
          vaults: share.role === 'member' ? get().vaults.filter((v) => v.id !== vaultId) : get().vaults,
          vaultSync:
            share.role === 'member' ? forgottenVaults(get().vaultSync, [vaultId], false) : get().vaultSync,
        });
      },

      linkSpots: (vaultId, linked, unlinked) => {
        const share = get().shared[vaultId];
        if (!share) return;
        const gone = new Set(unlinked);
        const links = Object.fromEntries(Object.entries(share.links).filter(([pid]) => !gone.has(pid)));
        set({ shared: { ...get().shared, [vaultId]: { ...share, links: { ...links, ...linked } } } });
      },

      applyRemoteSpots: (vaultId, { added, removedSpotIds, cursor }) => {
        const share = get().shared[vaultId];
        if (!share) return;
        const links = { ...share.links };
        const linkedSpots = new Set(Object.values(links));
        const fresh: string[] = [];
        for (const { spotId, place } of added) {
          if (linkedSpots.has(spotId)) continue; // our own upload coming back
          const [pid] = get().addPlaces([place]);
          // Two people added the same place: keep the first link, the copy adds nothing.
          if (!links[pid]) {
            links[pid] = spotId;
            linkedSpots.add(spotId);
          }
          fresh.push(pid);
        }
        const removedIds = new Set(removedSpotIds);
        const removed = Object.entries(links)
          .filter(([, spot]) => removedIds.has(spot))
          .map(([pid]) => pid);
        for (const pid of removed) delete links[pid];
        const gone = new Set(removed);
        const now = Date.now();
        set({
          vaults: get().vaults.map((v) => {
            if (v.id !== vaultId) return v;
            const kept = v.placeIds.filter((id) => !gone.has(id));
            const joined = fresh.filter((id) => !kept.includes(id));
            if (!joined.length && kept.length === v.placeIds.length) return v;
            return { ...v, placeIds: [...joined, ...kept], updatedAt: now };
          }),
          shared: { ...get().shared, [vaultId]: { ...share, links, cursor: cursor ?? share.cursor } },
          // The owner's own copy of the vault (their place ids) follows along.
          vaultSync:
            share.role === 'owner' && (fresh.length || removed.length)
              ? touched(get().vaultSync, [vaultId])
              : get().vaultSync,
        });
      },

      applySharedInfo: (vaultId, { name, emoji, people }) => {
        const share = get().shared[vaultId];
        if (!share) return;
        set({
          vaults: get().vaults.map((v) =>
            v.id === vaultId && name !== undefined && (v.name !== name || v.emoji !== emoji)
              ? { ...v, name, emoji }
              : v,
          ),
          shared: { ...get().shared, [vaultId]: { ...share, people: people ?? share.people } },
        });
      },

      addToVault: (vaultId, placeIds) => {
        const vault = get().vaults.find((v) => v.id === vaultId);
        if (!vault) return;
        const fresh = [...new Set(placeIds)].filter((id) => !vault.placeIds.includes(id));
        if (!fresh.length) return;
        set({
          vaults: get().vaults.map((v) =>
            v.id === vaultId ? { ...v, placeIds: [...fresh, ...v.placeIds], updatedAt: Date.now() } : v,
          ),
          vaultSync: touched(get().vaultSync, [vaultId]),
        });
      },

      importVault: ({ name, emoji, places }) => {
        const ids = get().addPlaces(places);
        return get().createVault({ name, emoji, placeIds: ids });
      },

      removeFromVault: (vaultId, placeIds) => {
        const gone = new Set(placeIds);
        const vault = get().vaults.find((v) => v.id === vaultId);
        if (!vault?.placeIds.some((id) => gone.has(id))) return;
        set({
          vaults: get().vaults.map((v) =>
            v.id === vaultId
              ? { ...v, placeIds: v.placeIds.filter((id) => !gone.has(id)), updatedAt: Date.now() }
              : v,
          ),
          vaultSync: touched(get().vaultSync, [vaultId]),
        });
      },

      createTrip: ({ name, city, placeIds, days }) => {
        const wanted = new Set(placeIds);
        const chosen = get().places.filter((p) => wanted.has(p.id));
        const trip: Trip = { id: newId(), name, city, days: planTrip(chosen, days), createdAt: Date.now() };
        set({ trips: [trip, ...get().trips] });
        return trip.id;
      },

      importTrip: ({ name, city, days }) => {
        const dayIds = days.map((d) => get().addPlaces(d));
        const trip: Trip = {
          id: newId(),
          name,
          city,
          days: dayIds.map((placeIds, i) => ({ day: i + 1, placeIds: [...new Set(placeIds)] })),
          createdAt: Date.now(),
          shared: true,
        };
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

      removeTrip: (id) => {
        set({ trips: get().trips.filter((t) => t.id !== id) });
        useLedgerStore.getState().removeLedger(id);
      },
      completeOnboarding: () => set({ onboarded: true }),
      setPro: (isPro) => set({ isPro }),
      addTripPass: (days) =>
        set({
          tripPasses: get().tripPasses + 1,
          passUntil: Math.max(get().passUntil, Date.now()) + days * 86_400_000,
        }),
      countAiImport: () => {
        const month = monthKey();
        const used = get().aiImports;
        set({ aiImports: { month, count: used.month === month ? used.count + 1 : 1 } });
      },
      adoptAccount: (userId) =>
        set({
          sync: {
            ownerId: userId,
            dirty: Object.fromEntries(get().places.map((p) => [p.id, Date.now()])),
            deleted: [],
          },
          vaultSync: {
            dirty: Object.fromEntries(get().vaults.map((v) => [v.id, Date.now()])),
            deleted: [],
          },
        }),

      markPushed: (done, deleted) => set({ sync: pushed(get().sync, done, deleted) }),

      markVaultsPushed: (done, deleted) => set({ vaultSync: pushed(get().vaultSync, done, deleted) }),

      applyRemoteVaults: ({ upserts, deletedIds, cursor }) => {
        const sync = get().vaultSync;
        const pending = (id: string) => id in sync.dirty || sync.deleted.includes(id);
        const incoming = new globalThis.Map(upserts.filter((v) => !pending(v.id)).map((v) => [v.id, v]));
        const removed = new Set(deletedIds.filter((id) => !pending(id)));
        const kept = get()
          .vaults.filter((v) => !removed.has(v.id))
          .map((v) => {
            const next = incoming.get(v.id);
            incoming.delete(v.id);
            return next ?? v;
          });
        set({
          vaults: [...incoming.values(), ...kept].sort((a, b) => b.createdAt - a.createdAt),
          vaultSync: { ...sync, cursor: cursor ?? sync.cursor },
        });
      },

      applyRemotePlaces: ({ upserts, deletedIds, cursor }) => {
        const sync = get().sync;
        const pending = (id: string) => id in sync.dirty || sync.deleted.includes(id);
        const incoming = new globalThis.Map(upserts.filter((p) => !pending(p.id)).map((p) => [p.id, p]));
        const removed = new Set(deletedIds.filter((id) => !pending(id)));
        const kept = get()
          .places.filter((p) => !removed.has(p.id))
          .map((p) => {
            const next = incoming.get(p.id);
            incoming.delete(p.id);
            return next ?? p;
          });
        set({
          places: [...incoming.values(), ...kept].sort((a, b) => b.savedAt - a.savedAt),
          trips: removed.size ? withoutPlaces(get().trips, removed) : get().trips,
          sync: { ...sync, cursor: cursor ?? sync.cursor },
        });
      },

      // Signed in, a reset is a delete everywhere, like any other delete: otherwise the next
      // sync would quietly bring everything back.
      reset: () => {
        const { sync, places, vaultSync, shared } = get();
        // Vaults you joined belong to someone else: resetting leaves them, it doesn't delete them.
        const vaults = get().vaults.filter((v) => shared[v.id]?.role !== 'member');
        set({
          ...initialState,
          sync: sync.ownerId
            ? { ...sync, dirty: {}, deleted: [...new Set([...sync.deleted, ...places.map((p) => p.id)])] }
            : initialState.sync,
          vaultSync: sync.ownerId
            ? {
                ...vaultSync,
                dirty: {},
                deleted: [...new Set([...vaultSync.deleted, ...vaults.map((v) => v.id)])],
              }
            : initialState.vaultSync,
        });
        useLedgerStore.getState().reset();
      },
    }),
    {
      // Keep the original key so existing installs keep their data.
      name: 'travyy-store-v1',
      version: STORE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        places,
        trips,
        vaults,
        onboarded,
        isPro,
        tripPasses,
        passUntil,
        aiImports,
        sync,
        vaultSync,
        shared,
      }) => ({
        shared,
        places,
        trips,
        vaults,
        vaultSync,
        onboarded,
        isPro,
        tripPasses,
        passUntil,
        aiImports,
        sync,
      }),
      migrate: (persisted) => persisted as AppState,
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

const AiImportsSchema = z.object({ month: z.string(), count: z.number().int().nonnegative() });
const SyncSchema = z.object({
  ownerId: z.string().optional(),
  cursor: z.string().optional(),
  dirty: z.record(z.string(), z.number()),
  deleted: z.array(z.string()),
});
const VaultSyncSchema = SyncSchema.omit({ ownerId: true });
const SharedSchema = z.record(
  z.string(),
  z.object({
    role: z.enum(['owner', 'member']),
    inviteToken: z.string().optional(),
    links: z.record(z.string(), z.string()),
    cursor: z.string().optional(),
    people: z.number().int().nonnegative().optional(),
  }),
);
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** Validate persisted state record by record. Exported for tests. */
export function sanitize(raw: unknown): Partial<AppState> {
  if (!raw || typeof raw !== 'object') return {};
  const state = raw as Record<string, unknown>;
  return {
    places: keepValid<Place>(state.places, PlaceSchema),
    trips: keepValid<Trip>(state.trips, TripSchema),
    vaults: keepValid<Vault>(state.vaults, VaultSchema),
    onboarded: state.onboarded === true,
    isPro: state.isPro === true,
    tripPasses: count(state.tripPasses),
    passUntil: count(state.passUntil),
    aiImports: AiImportsSchema.safeParse(state.aiImports).data ?? initialState.aiImports,
    // Unreadable sync state starts over: the next sign-in uploads everything again, which is safe.
    sync: SyncSchema.safeParse(state.sync).data ?? initialState.sync,
    vaultSync: VaultSyncSchema.safeParse(state.vaultSync).data ?? initialState.vaultSync,
    // Unreadable: shared vaults become private ones here; joining again restores them.
    shared: SharedSchema.safeParse(state.shared).data ?? initialState.shared,
  };
}

export const hydration = {
  isHydrated: () => useAppStore.persist.hasHydrated() && useLedgerStore.persist.hasHydrated(),
  subscribe: (cb: () => void) => {
    const offApp = useAppStore.persist.onFinishHydration(cb);
    const offLedger = useLedgerStore.persist.onFinishHydration(cb);
    return () => {
      offApp();
      offLedger();
    };
  },
};
