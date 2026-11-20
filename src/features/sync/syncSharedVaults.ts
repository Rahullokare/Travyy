import { z } from 'zod';
import { CategorySchema, type Place } from '@/domain/models';
import { newId } from '@/shared/lib/id';
import { useAppStore, type RemoteSpot } from '@/store';

/**
 * Vaults shared with friends. Each phone keeps the vault as an ordinary vault of its own saved
 * places; this round keeps it in step with `public.vault_spots`, where every spot is a copy that
 * everyone in the vault can read (saved places themselves stay private).
 *
 * Per shared vault: refresh the name and head count, upload places added here since last time
 * (and take out ones removed here), then download what the others added or took out. A place
 * from someone else joins your saves, so it shows on your map and you keep your own visited and
 * ❤ marks for it.
 */
export interface SpotUpload {
  id: string;
  vault_id: string;
  name: string;
  city: string | null;
  country: string | null;
  country_code: string | null;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface SharedVaultsRemote {
  /** The vault rows you can see: yours and ones you joined. Missing means gone or you were removed. */
  info(vaultIds: string[]): Promise<unknown[]>;
  /** How many people are in each vault besides the owner. */
  memberCounts(vaultIds: string[]): Promise<Record<string, number>>;
  /** Insert only: a retried upload must never overwrite. */
  insertSpots(rows: SpotUpload[]): Promise<void>;
  removeSpots(spotIds: string[]): Promise<void>;
  /** One vault's spots changed at or after `since` (all when undefined), oldest change first. */
  pullSpots(vaultId: string, since: string | undefined, offset: number, limit: number): Promise<unknown[]>;
  inviteToken(vaultId: string): Promise<string | undefined>;
  join(token: string): Promise<string>;
  leave(vaultId: string): Promise<void>;
  /** Removes everyone and cancels the invite link. */
  stopSharing(vaultId: string): Promise<void>;
}

const InfoRow = z.object({
  id: z.string(),
  name: z.string().min(1),
  emoji: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

const SpotRow = z.object({
  id: z.string(),
  vault_id: z.string(),
  name: z.string().min(1).max(200),
  city: z.string().nullable(),
  country: z.string().nullable(),
  country_code: z.string().nullable(),
  category: CategorySchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().nullable(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export function toSpotRow(vaultId: string, place: Place, id = newId()): SpotUpload {
  return {
    id,
    vault_id: vaultId,
    name: place.name.slice(0, 200),
    city: place.city ?? null,
    country: place.country ?? null,
    country_code: place.countryCode ?? null,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    address: place.address?.slice(0, 300) ?? null,
  };
}

export function parseVaultInfo(raw: unknown) {
  const row = InfoRow.safeParse(raw);
  return row.success ? row.data : undefined;
}

const PAGE = 500;
const UPLOAD_BATCH = 200;

export async function syncSharedVaults(remote: SharedVaultsRemote): Promise<void> {
  const store = useAppStore.getState;
  const ids = Object.keys(store().shared);
  if (ids.length === 0) return;

  // 1. Still there? Name and head count.
  const [rows, counts] = await Promise.all([remote.info(ids), remote.memberCounts(ids)]);
  const info = new Map(rows.map(parseVaultInfo).flatMap((r) => (r ? [[r.id, r] as const] : [])));
  for (const id of ids) {
    const row = info.get(id);
    const share = store().shared[id];
    if (!row || row.deleted_at) {
      // Deleted by its owner, or you were taken out: it stops being shared here.
      store().unshareVault(id);
      continue;
    }
    store().applySharedInfo(id, {
      ...(share.role === 'member' ? { name: row.name, emoji: row.emoji ?? undefined } : {}),
      people: 1 + (counts[id] ?? 0),
    });
  }

  for (const id of Object.keys(store().shared)) {
    // 2. Upload what changed here.
    const vault = store().vaults.find((v) => v.id === id);
    if (!vault) {
      store().unshareVault(id);
      continue;
    }
    const { links } = store().shared[id];
    const byId = new Map(store().places.map((p) => [p.id, p]));
    const fresh = vault.placeIds.flatMap((pid) => {
      const place = byId.get(pid);
      return place && !links[pid] ? [{ pid, row: toSpotRow(id, place) }] : [];
    });
    const inVault = new Set(vault.placeIds);
    const removed = Object.entries(links).filter(([pid]) => !inVault.has(pid));
    for (let i = 0; i < fresh.length; i += UPLOAD_BATCH) {
      await remote.insertSpots(fresh.slice(i, i + UPLOAD_BATCH).map((f) => f.row));
    }
    if (removed.length) await remote.removeSpots(removed.map(([, spot]) => spot));
    store().linkSpots(
      id,
      Object.fromEntries(fresh.map((f) => [f.pid, f.row.id])),
      removed.map(([pid]) => pid),
    );

    // 3. Download what the others did. Our own uploads come back too and are recognised by id.
    const since = store().shared[id]?.cursor;
    let cursor = since;
    for (let offset = 0; ; offset += PAGE) {
      const page = await remote.pullSpots(id, since, offset, PAGE);
      const spots = page.map((r) => SpotRow.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []));
      for (const s of spots) if (!cursor || s.updated_at > cursor) cursor = s.updated_at;
      store().applyRemoteSpots(id, {
        added: spots
          .filter((s) => !s.deleted_at)
          .map((s): RemoteSpot => ({
            spotId: s.id,
            place: {
              name: s.name,
              city: s.city ?? undefined,
              country: s.country ?? undefined,
              countryCode: s.country_code ?? undefined,
              category: s.category,
              lat: s.lat,
              lng: s.lng,
              address: s.address ?? undefined,
              sourcePlatform: 'manual',
            },
          })),
        removedSpotIds: spots.filter((s) => s.deleted_at).map((s) => s.id),
        cursor,
      });
      if (page.length < PAGE) break;
    }
  }
}
