import { beforeEach, describe, expect, it } from '@jest/globals';
import type { NewPlace } from '@/domain/models';
import { fromVaultRow, toVaultRow, type VaultRow } from '@/features/sync/vaultRows';
import { syncVaults, type VaultsRemote } from '@/features/sync/syncVaults';
import { sanitize, useAppStore } from '@/store';
import { LIKED_VAULT_ID, placesInVault, vaultSummaries, vaultSummary, vaultsWith } from '../vaults';

const spot = (name: string, lat: number, city = 'Goa'): NewPlace => ({
  name,
  lat,
  lng: 73.8,
  city,
  category: 'cafe',
  sourcePlatform: 'instagram',
});

const store = useAppStore.getState;

beforeEach(() => {
  useAppStore.setState({ sync: { dirty: {}, deleted: [] }, vaultSync: { dirty: {}, deleted: [] } });
  store().reset();
});

describe('custom vaults', () => {
  it('holds places by reference, newest added first, without duplicates', () => {
    const [a, b, c] = store().addPlaces([
      spot('Artjuna', 15.6),
      spot('Bean Me Up', 15.5),
      spot('Cafe Cotinga', 15.4),
    ]);
    const id = store().createVault({ name: '  Cafés to try ', emoji: '☕', placeIds: [a] });
    store().addToVault(id, [b, c, a]);
    const vault = store().vaults[0];
    expect(vault.name).toBe('Cafés to try');
    expect(vault.placeIds).toEqual([b, c, a]);
    expect(store().vaultSync.dirty).toHaveProperty(id);
  });

  it('lets one place sit in several vaults, and deleting a vault keeps the places', () => {
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    const one = store().createVault({ name: 'Goa weekend', placeIds: [a] });
    const two = store().createVault({ name: 'Cafés', placeIds: [a] });
    expect(
      vaultsWith(store().vaults, a)
        .map((v) => v.id)
        .sort(),
    ).toEqual([one, two].sort());
    store().removeVault(one);
    expect(store().vaults.map((v) => v.id)).toEqual([two]);
    expect(store().places).toHaveLength(1);
  });

  it('drops a deleted place from every vault and queues those vaults for upload', () => {
    const [a, b] = store().addPlaces([spot('Artjuna', 15.6), spot('Bean Me Up', 15.5)]);
    const id = store().createVault({ name: 'Goa', placeIds: [a, b] });
    useAppStore.setState({ vaultSync: { dirty: {}, deleted: [] } });
    store().removePlace(a);
    expect(store().vaults[0].placeIds).toEqual([b]);
    expect(store().vaultSync.dirty).toHaveProperty(id);
  });

  it('reads past ids of places deleted on another phone', () => {
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    expect(placesInVault({ placeIds: ['gone', a] }, store().places).map((p) => p.name)).toEqual(['Artjuna']);
  });

  it('counts how much of a vault is done', () => {
    const [a, b] = store().addPlaces([spot('Artjuna', 15.6), spot('Bean Me Up', 15.5, 'Panaji')]);
    const id = store().createVault({ name: 'Goa', placeIds: [a, b] });
    store().toggleVisited(a);
    const summary = vaultSummary(id, store().vaults, store().places);
    expect(summary).toMatchObject({ visited: 1, custom: true, cities: ['Goa', 'Panaji'] });
    expect(summary?.places).toHaveLength(2);
  });

  it('survives a reload, and a broken vault is dropped instead of the rest', () => {
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    store().createVault({ name: 'Goa', placeIds: [a] });
    const persisted = JSON.parse(JSON.stringify(store()));
    persisted.vaults.push({ id: 'x', name: '' });
    const restored = sanitize(persisted);
    expect(restored.vaults).toHaveLength(1);
    expect(restored.vaultSync).toEqual(store().vaultSync);
  });
});

describe('the Liked vault', () => {
  it('builds itself from ❤ marks and only shows once something is liked', () => {
    const [a, b] = store().addPlaces([spot('Artjuna', 15.6), spot('Bean Me Up', 15.5)]);
    expect(vaultSummaries(store().vaults, store().places)).toEqual([]);
    store().toggleLiked(b);
    store().toggleLiked(a);
    const [liked] = vaultSummaries(store().vaults, store().places);
    expect(liked.id).toBe(LIKED_VAULT_ID);
    expect(liked.places.map((p) => p.name)).toHaveLength(2);
    store().toggleLiked(a);
    expect(vaultSummary(LIKED_VAULT_ID, [], store().places)?.places.map((p) => p.id)).toEqual([b]);
  });
});

describe('syncing vaults', () => {
  function fakeServer() {
    const rows = new Map<string, VaultRow>();
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 20, 0, 0, ++tick)).toISOString();
    const remote: VaultsRemote = {
      async upsert(batch) {
        const at = now();
        for (const row of batch) rows.set(row.id, { ...row, updated_at: at });
      },
      async softDelete(ids) {
        const at = now();
        for (const id of ids) {
          const row = rows.get(id);
          if (row) rows.set(id, { ...row, deleted_at: at, updated_at: at });
        }
      },
      async pull(since, offset, limit) {
        return [...rows.values()]
          .filter((r) => !since || r.updated_at >= since)
          .sort((x, y) => x.updated_at.localeCompare(y.updated_at))
          .slice(offset, offset + limit);
      },
    };
    return { remote, rows };
  }

  it('uploads vaults, then brings them to a second phone, deletions included', async () => {
    const server = fakeServer();
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    store().adoptAccount('asha');
    const id = store().createVault({ name: 'Goa', emoji: '🌅', placeIds: [a] });
    await syncVaults(server.remote);
    expect(server.rows.get(id)).toMatchObject({ name: 'Goa', emoji: '🌅', place_ids: [a] });
    expect(store().vaultSync.dirty).toEqual({});

    // Second phone.
    const first = { vaults: store().vaults, vaultSync: store().vaultSync };
    useAppStore.setState({ vaults: [], vaultSync: { dirty: {}, deleted: [] } });
    await syncVaults(server.remote);
    expect(store().vaults.map((v) => v.name)).toEqual(['Goa']);
    store().removeVault(id);
    await syncVaults(server.remote);
    expect(server.rows.get(id)?.deleted_at).toBeTruthy();

    // Back on the first phone, the deletion arrives.
    useAppStore.setState(first);
    await syncVaults(server.remote);
    expect(store().vaults).toEqual([]);
  });

  it('round-trips a row and skips one that does not parse', () => {
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    store().createVault({ name: 'Goa', placeIds: [a] });
    const row = { ...toVaultRow(store().vaults[0]), updated_at: '2026-11-20T00:00:00.000Z' };
    expect(fromVaultRow(row)?.vault).toMatchObject({ name: 'Goa', placeIds: [a] });
    expect(fromVaultRow({ ...row, place_ids: 'nope' })).toBeUndefined();
  });
});
