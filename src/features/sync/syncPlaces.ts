import { useAppStore } from '@/store';
import { fromRow, toRow, type PlaceUpload } from './placeRows';

/**
 * Backs up saved places to the signed-in account and brings in changes from the person's other
 * phones. The phone stays the source the screens read: this runs beside it and never blocks it.
 *
 * One round is "upload what changed here, then download what changed elsewhere". Conflicts are
 * settled by whoever wrote last, per place. The server stamps every change with its own clock,
 * so two phones with wrong clocks still agree on the order.
 */
export interface PlacesRemote {
  /** Insert or replace by id. */
  upsert(rows: PlaceUpload[]): Promise<void>;
  /** Marks rows deleted, so the person's other phones hear about it. */
  softDelete(ids: string[]): Promise<void>;
  /** Rows changed at or after `since` (all rows when undefined), oldest change first. */
  pull(since: string | undefined, offset: number, limit: number): Promise<unknown[]>;
}

export type SyncOutcome =
  | { status: 'synced'; uploaded: number; downloaded: number }
  /** This phone's saves belong to a different account: mixing two people's saves is never right. */
  | { status: 'other-account' };

const UPLOAD_BATCH = 200;
const PAGE = 500;

export async function syncPlaces(remote: PlacesRemote, userId: string): Promise<SyncOutcome> {
  const store = useAppStore.getState;
  const owner = store().sync.ownerId;
  if (!owner) store().adoptAccount(userId);
  else if (owner !== userId) return { status: 'other-account' };

  // Upload. The snapshot records when each place was last changed, so one edited again while
  // the request is in flight stays queued for the next round.
  const { dirty, deleted } = store().sync;
  const changed = store().places.filter((p) => p.id in dirty);
  for (let i = 0; i < changed.length; i += UPLOAD_BATCH) {
    await remote.upsert(changed.slice(i, i + UPLOAD_BATCH).map(toRow));
  }
  if (deleted.length) await remote.softDelete(deleted);
  store().markPushed(dirty, deleted);

  // Download. `since` is inclusive: rows uploaded in one request share a timestamp, so "after"
  // could skip some of them. Re-reading a few rows is harmless; applying a row twice changes nothing.
  const since = store().sync.cursor;
  let cursor = since;
  let downloaded = 0;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await remote.pull(since, offset, PAGE);
    const changes = rows.map(fromRow).filter((c) => c !== undefined);
    for (const c of changes) if (!cursor || c.updatedAt > cursor) cursor = c.updatedAt;
    downloaded += changes.length;
    store().applyRemotePlaces({
      upserts: changes.flatMap((c) => (c.place ? [c.place] : [])),
      deletedIds: changes.filter((c) => !c.place).map((c) => c.id),
      cursor,
    });
    if (rows.length < PAGE) break;
  }
  return { status: 'synced', uploaded: changed.length + deleted.length, downloaded };
}
