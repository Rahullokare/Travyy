import { beforeEach, describe, expect, it } from '@jest/globals';
import type { NewPlace } from '@/domain/models';
import { useAppStore } from '@/store';
import type { PlaceRow, PlaceUpload } from '../placeRows';
import { syncPlaces, type PlacesRemote } from '../syncPlaces';

/** A stand-in for the `places` table: stamps each write with its own ever-increasing clock, as the database does. */
function fakeServer() {
  const rows = new Map<string, PlaceRow>();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 16, 0, 0, ++tick)).toISOString();
  const calls = { upsert: 0, softDelete: 0, pull: 0 };
  const remote: PlacesRemote & { beforeUpsert?: () => void } = {
    async upsert(batch: PlaceUpload[]) {
      calls.upsert++;
      remote.beforeUpsert?.();
      const at = now();
      for (const row of batch) rows.set(row.id, { ...row, updated_at: at });
    },
    async softDelete(ids) {
      calls.softDelete++;
      const at = now();
      for (const id of ids) {
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, deleted_at: at, updated_at: at });
      }
    },
    async pull(since, offset, limit) {
      calls.pull++;
      return [...rows.values()]
        .filter((r) => !since || r.updated_at >= since)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
        .slice(offset, offset + limit);
    },
  };
  return { remote, rows, calls };
}

const spot = (name: string, lat = 38.7): NewPlace => ({
  name,
  lat,
  lng: -9.1,
  city: 'Lisbon',
  country: 'Portugal',
  category: 'food',
  sourcePlatform: 'instagram',
  note: 'Order the prawns',
});

const store = useAppStore.getState;
const names = () =>
  store()
    .places.map((p) => p.name)
    .sort();
const live = (server: ReturnType<typeof fakeServer>) =>
  [...server.rows.values()].filter((r) => !r.deleted_at).map((r) => r.name);

/** A second phone: same account, nothing saved yet. Returns a way back to the first phone. */
function switchPhone() {
  const snapshot = { places: store().places, trips: store().trips, sync: store().sync };
  useAppStore.setState({ places: [], trips: [], sync: { dirty: {}, deleted: [] } });
  return () => useAppStore.setState(snapshot);
}

beforeEach(() => {
  useAppStore.setState({ sync: { dirty: {}, deleted: [] } });
  store().reset();
});

describe('backing up saved places', () => {
  it('uploads everything already on the phone at first sign-in', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro'), spot('Time Out Market', 38.71)]);
    const outcome = await syncPlaces(server.remote, 'asha');
    expect(outcome).toMatchObject({ status: 'synced', uploaded: 2 });
    expect(live(server).sort()).toEqual(['Ramiro', 'Time Out Market']);
    expect(store().sync).toMatchObject({ ownerId: 'asha', dirty: {}, deleted: [] });
    expect([...server.rows.values()][0]).toMatchObject({ country_code: 'PT', note: 'Order the prawns' });
  });

  it('uploads only what changed afterwards', async () => {
    const server = fakeServer();
    const [id] = store().addPlaces([spot('Ramiro'), spot('Time Out Market', 38.71)]);
    await syncPlaces(server.remote, 'asha');
    store().toggleVisited(id);
    const outcome = await syncPlaces(server.remote, 'asha');
    expect(outcome).toMatchObject({ uploaded: 1 });
    expect(server.rows.get(id)?.visited_at).not.toBeNull();
  });

  it('does nothing on the network side when nothing changed, beyond one check for news', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro')]);
    await syncPlaces(server.remote, 'asha');
    const before = { ...server.calls };
    await syncPlaces(server.remote, 'asha');
    expect(server.calls).toEqual({ ...before, pull: before.pull + 1 });
  });

  it('keeps a change made while the upload was in flight queued for the next round', async () => {
    const server = fakeServer();
    const [id] = store().addPlaces([spot('Ramiro')]);
    server.remote.beforeUpsert = () => {
      server.remote.beforeUpsert = undefined;
      const realNow = Date.now;
      Date.now = () => realNow() + 5;
      store().updatePlace(id, { note: 'Changed mid-upload' });
      Date.now = realNow;
    };
    await syncPlaces(server.remote, 'asha');
    expect(Object.keys(store().sync.dirty)).toEqual([id]);
    expect(store().places[0].note).toBe('Changed mid-upload');
    await syncPlaces(server.remote, 'asha');
    expect(server.rows.get(id)?.note).toBe('Changed mid-upload');
    expect(store().sync.dirty).toEqual({});
  });

  it('leaves changes queued when the upload fails, and sends them next time', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro')]);
    const offline: PlacesRemote = { ...server.remote, upsert: () => Promise.reject(new Error('offline')) };
    await expect(syncPlaces(offline, 'asha')).rejects.toThrow('offline');
    expect(Object.keys(store().sync.dirty)).toHaveLength(1);
    await syncPlaces(server.remote, 'asha');
    expect(live(server)).toEqual(['Ramiro']);
  });
});

describe('a second phone on the same account', () => {
  it('gets everything, then changes flow both ways', async () => {
    const server = fakeServer();
    const [ramiro] = store().addPlaces([spot('Ramiro'), spot('Time Out Market', 38.71)]);
    await syncPlaces(server.remote, 'asha');

    const backToFirst = switchPhone();
    await syncPlaces(server.remote, 'asha');
    expect(names()).toEqual(['Ramiro', 'Time Out Market']);
    expect(store().places.find((p) => p.id === ramiro)?.countryCode).toBe('PT');
    // Downloading isn't a local change: nothing is queued to go straight back up.
    expect(store().sync.dirty).toEqual({});

    store().addPlaces([spot('Park Bar', 38.72)]);
    store().updatePlace(ramiro, { note: 'Go early' });
    await syncPlaces(server.remote, 'asha');

    backToFirst();
    await syncPlaces(server.remote, 'asha');
    expect(names()).toEqual(['Park Bar', 'Ramiro', 'Time Out Market']);
    expect(store().places.find((p) => p.id === ramiro)?.note).toBe('Go early');
  });

  it('hears about deletions, and trips drop the deleted stop', async () => {
    const server = fakeServer();
    const ids = store().addPlaces([spot('Ramiro'), spot('Time Out Market', 38.71), spot('Park Bar', 38.72)]);
    const tripId = store().createTrip({ name: 'Lisbon', city: 'Lisbon', placeIds: ids, days: 1 });
    await syncPlaces(server.remote, 'asha');

    const backToFirst = switchPhone();
    await syncPlaces(server.remote, 'asha');
    store().removePlace(ids[0]);
    await syncPlaces(server.remote, 'asha');
    expect(live(server).sort()).toEqual(['Park Bar', 'Time Out Market']);

    backToFirst();
    await syncPlaces(server.remote, 'asha');
    expect(names()).toEqual(['Park Bar', 'Time Out Market']);
    const stops = store()
      .trips.find((t) => t.id === tripId)
      ?.days.flatMap((d) => d.placeIds);
    expect(stops).not.toContain(ids[0]);
    expect(stops).toHaveLength(2);
  });

  it('does not overwrite an edit made here that has not been uploaded yet', async () => {
    const server = fakeServer();
    const [id] = store().addPlaces([spot('Ramiro')]);
    await syncPlaces(server.remote, 'asha');
    await server.remote.upsert([{ ...[...server.rows.values()][0], note: 'From the other phone' }]);
    store().updatePlace(id, { note: 'From this phone' });
    // The local edit goes up first and, being the last write, wins on both sides.
    await syncPlaces(server.remote, 'asha');
    expect(store().places[0].note).toBe('From this phone');
    expect(server.rows.get(id)?.note).toBe('From this phone');
  });
});

describe('edges', () => {
  it('never mixes two accounts on one phone', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro')]);
    await syncPlaces(server.remote, 'asha');
    const calls = { ...server.calls };
    expect(await syncPlaces(server.remote, 'ben')).toEqual({ status: 'other-account' });
    expect(server.calls).toEqual(calls);
  });

  it('treats "reset all data" while signed in as deleting everywhere', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro'), spot('Park Bar', 38.72)]);
    await syncPlaces(server.remote, 'asha');
    store().reset();
    expect(store().places).toEqual([]);
    await syncPlaces(server.remote, 'asha');
    expect(live(server)).toEqual([]);
    expect(store().places).toEqual([]);
  });

  it('skips rows it cannot read instead of failing the whole sync', async () => {
    const server = fakeServer();
    store().addPlaces([spot('Ramiro')]);
    await syncPlaces(server.remote, 'asha');
    const good = [...server.rows.values()][0];
    server.rows.set('bad', { ...good, id: 'bad', lat: 999, updated_at: '2026-11-17T00:00:00.000Z' });
    server.rows.set('junk', { id: 'junk' } as PlaceRow);
    const outcome = await syncPlaces(server.remote, 'asha');
    expect(outcome.status).toBe('synced');
    expect(names()).toEqual(['Ramiro']);
  });

  it('pages through a large backup', async () => {
    const server = fakeServer();
    store().addPlaces(Array.from({ length: 620 }, (_, i) => spot(`Spot ${i}`, -80 + i * 0.25)));
    await syncPlaces(server.remote, 'asha');
    expect(server.calls.upsert).toBe(4);
    switchPhone();
    const outcome = await syncPlaces(server.remote, 'asha');
    expect(outcome).toMatchObject({ downloaded: 620 });
    expect(store().places).toHaveLength(620);
  });
});
