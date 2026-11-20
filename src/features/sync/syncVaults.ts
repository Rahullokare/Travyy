import { useAppStore } from '@/store';
import type { PlacesRemote } from './syncPlaces';
import { fromVaultRow, toVaultRow, type VaultUpload } from './vaultRows';

/** `public.vaults`, with the same three calls as places. */
export type VaultsRemote = Omit<PlacesRemote, 'upsert'> & { upsert(rows: VaultUpload[]): Promise<void> };

const UPLOAD_BATCH = 200;
const PAGE = 500;

/**
 * Same round as `syncPlaces`, for vaults: upload what changed here, then download what changed
 * elsewhere, last write wins per vault. Runs after places, which has already checked the account.
 */
export async function syncVaults(remote: VaultsRemote): Promise<{ uploaded: number; downloaded: number }> {
  const store = useAppStore.getState;

  const { dirty, deleted } = store().vaultSync;
  // A vault you joined is someone else's row: what you add to it travels as shared spots.
  const changed = store().vaults.filter((v) => v.id in dirty && store().shared[v.id]?.role !== 'member');
  for (let i = 0; i < changed.length; i += UPLOAD_BATCH) {
    await remote.upsert(changed.slice(i, i + UPLOAD_BATCH).map(toVaultRow));
  }
  if (deleted.length) await remote.softDelete(deleted);
  store().markVaultsPushed(dirty, deleted);

  const since = store().vaultSync.cursor;
  let cursor = since;
  let downloaded = 0;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await remote.pull(since, offset, PAGE);
    const changes = rows.map(fromVaultRow).filter((c) => c !== undefined);
    for (const c of changes) if (!cursor || c.updatedAt > cursor) cursor = c.updatedAt;
    downloaded += changes.length;
    store().applyRemoteVaults({
      upserts: changes.flatMap((c) => (c.vault ? [c.vault] : [])),
      deletedIds: changes.filter((c) => !c.vault).map((c) => c.id),
      cursor,
    });
    if (rows.length < PAGE) break;
  }
  return { uploaded: changed.length + deleted.length, downloaded };
}
