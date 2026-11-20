import { beforeEach, describe, expect, it } from '@jest/globals';
import type { NewPlace } from '@/domain/models';
import { syncSharedVaults, type SharedVaultsRemote, type SpotUpload } from '@/features/sync/syncSharedVaults';
import { useAppStore, type AppState } from '@/store';
import { decodeVault, encodeVault, MAX_LINK_SPOTS, vaultShareText, vaultShareUrl } from '../vaultLink';

const spot = (name: string, lat: number, city = 'Goa'): NewPlace => ({
  name,
  lat,
  lng: 73.8,
  city,
  country: 'India',
  countryCode: 'IN',
  category: 'cafe',
  sourcePlatform: 'instagram',
  note: 'private note',
});

const store = useAppStore.getState;
const names = (vaultId: string) => {
  const byId = new Map(store().places.map((p) => [p.id, p.name]));
  return (store().vaults.find((v) => v.id === vaultId)?.placeIds ?? []).map((id) => byId.get(id)).sort();
};

beforeEach(() => {
  useAppStore.setState({
    sync: { dirty: {}, deleted: [] },
    vaultSync: { dirty: {}, deleted: [] },
    shared: {},
  });
  store().reset();
});

describe('a vault in a link', () => {
  it('round-trips name, emoji, spots and cities, and leaves notes out', () => {
    const ids = store().addPlaces([
      spot('Artjuna', 15.6),
      spot('Bean Me Up', 15.5),
      spot('Kala Ghoda', 18.9, 'Mumbai'),
    ]);
    const places = store().places.filter((p) => ids.includes(p.id));
    const decoded = decodeVault(encodeVault({ name: 'Cafés to try', emoji: '☕' }, places));
    expect(decoded).toMatchObject({ name: 'Cafés to try', emoji: '☕' });
    expect(decoded?.places.map((p) => [p.name, p.city, p.countryCode]).sort()).toEqual([
      ['Artjuna', 'Goa', 'IN'],
      ['Bean Me Up', 'Goa', 'IN'],
      ['Kala Ghoda', 'Mumbai', 'IN'],
    ]);
    expect(JSON.stringify(decoded)).not.toContain('private note');
  });

  it('refuses anything that is not exactly the format', () => {
    expect(decodeVault(undefined)).toBeUndefined();
    expect(decodeVault('not-a-vault')).toBeUndefined();
    expect(decodeVault(encodeVault({ name: 'Empty' }, []))).toBeUndefined();
  });

  it('caps a huge vault and builds the share text', () => {
    const many = Array.from({ length: MAX_LINK_SPOTS + 20 }, (_, i) => spot(`Spot ${i}`, 10 + i * 0.01));
    store().addPlaces(many);
    expect(decodeVault(encodeVault({ name: 'Big' }, store().places))?.places).toHaveLength(MAX_LINK_SPOTS);
    const url = vaultShareUrl({ name: 'Big' }, store().places.slice(0, 2), 'https://travyy.app');
    expect(url).toMatch(/^https:\/\/travyy\.app\/shared-vault\?d=/);
    expect(vaultShareText({ name: 'Big', emoji: '🌅' }, store().places.slice(0, 2), url)).toMatch(
      /^🌅 Big: 2 spots in Goa\nhttps/,
    );
  });

  it('imports into your saves without doubling spots you already have', () => {
    store().addPlaces([spot('Artjuna', 15.6)]);
    const shared = decodeVault(
      encodeVault({ name: 'Goa' }, [
        store().places[0],
        { ...store().places[0], id: 'x', name: 'New one', lat: 15.1 },
      ]),
    )!;
    const id = store().importVault(shared);
    expect(store().places).toHaveLength(2);
    expect(names(id)).toEqual(['Artjuna', 'New one']);
  });
});

/** The vault tables, shared by every phone in these tests. */
function fakeServer() {
  const spots = new Map<string, SpotUpload & { updated_at: string; deleted_at: string | null }>();
  const vaults = new Map<
    string,
    { id: string; name: string; emoji: string | null; created_at: string; deleted_at: string | null }
  >();
  const members = new Set<string>();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 21, 0, 0, ++tick)).toISOString();
  const remote: SharedVaultsRemote = {
    async info(ids) {
      return ids.flatMap((id) => (vaults.has(id) ? [vaults.get(id)] : []));
    },
    async memberCounts(ids) {
      return Object.fromEntries(ids.map((id) => [id, members.size]));
    },
    async insertSpots(rows) {
      const at = now();
      for (const r of rows) if (!spots.has(r.id)) spots.set(r.id, { ...r, updated_at: at, deleted_at: null });
    },
    async removeSpots(ids) {
      const at = now();
      for (const id of ids) {
        const s = spots.get(id);
        if (s) spots.set(id, { ...s, deleted_at: at, updated_at: at });
      }
    },
    async pullSpots(vaultId, since, offset, limit) {
      return [...spots.values()]
        .filter((s) => s.vault_id === vaultId && (!since || s.updated_at >= since))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(offset, offset + limit);
    },
    async inviteToken() {
      return 'token';
    },
    async join() {
      return [...vaults.keys()][0];
    },
    async leave() {},
    async stopSharing() {},
  };
  return { remote, spots, vaults, members, now };
}

type Phone = Pick<AppState, 'places' | 'vaults' | 'shared' | 'vaultSync' | 'sync'>;
const snapshot = (): Phone => ({
  places: store().places,
  vaults: store().vaults,
  shared: store().shared,
  vaultSync: store().vaultSync,
  sync: store().sync,
});
const blank: Phone = {
  places: [],
  vaults: [],
  shared: {},
  vaultSync: { dirty: {}, deleted: [] },
  sync: { dirty: {}, deleted: [] },
};

describe('a vault shared with friends', () => {
  it('brings everyone the same spots, both ways, including removals', async () => {
    const server = fakeServer();

    // Asha's phone: makes a vault and shares it.
    const [a, b] = store().addPlaces([spot('Artjuna', 15.6), spot('Bean Me Up', 15.5)]);
    const vaultId = store().createVault({ name: 'Goa weekend', emoji: '🌅', placeIds: [a, b] });
    server.vaults.set(vaultId, {
      id: vaultId,
      name: 'Goa weekend',
      emoji: '🌅',
      created_at: server.now(),
      deleted_at: null,
    });
    store().startSharing(vaultId, 'token');
    await syncSharedVaults(server.remote);
    expect(server.spots.size).toBe(2);
    expect(Object.keys(store().shared[vaultId].links)).toHaveLength(2);
    const asha = snapshot();

    // Ben's phone: joins, gets both spots in his saves and the vault.
    useAppStore.setState(blank);
    server.members.add('ben');
    store().joinSharedVault({ id: vaultId, name: 'Goa weekend', emoji: '🌅', createdAt: 0 });
    await syncSharedVaults(server.remote);
    expect(names(vaultId)).toEqual(['Artjuna', 'Bean Me Up']);
    expect(store().shared[vaultId]).toMatchObject({ role: 'member', people: 2 });
    // Ben adds one and takes one out.
    const [c] = store().addPlaces([spot('Cafe Cotinga', 15.4)]);
    store().addToVault(vaultId, [c]);
    const artjuna = store().places.find((p) => p.name === 'Artjuna')!.id;
    store().removeFromVault(vaultId, [artjuna]);
    await syncSharedVaults(server.remote);
    // His change stays out of his own vault backup: it's Asha's row.
    expect(store().places.find((p) => p.id === artjuna)).toBeDefined();
    const ben = snapshot();

    // Back on Asha's phone.
    useAppStore.setState(asha);
    await syncSharedVaults(server.remote);
    expect(names(vaultId)).toEqual(['Bean Me Up', 'Cafe Cotinga']);
    // Her own copy of the vault is queued for upload, since it changed.
    expect(store().vaultSync.dirty).toHaveProperty(vaultId);

    // Asha renames it on the server side; Ben picks the name up. She deletes it; it leaves Ben's phone.
    server.vaults.set(vaultId, { ...server.vaults.get(vaultId)!, name: 'Goa long weekend' });
    useAppStore.setState(ben);
    await syncSharedVaults(server.remote);
    expect(store().vaults.find((v) => v.id === vaultId)?.name).toBe('Goa long weekend');
    server.vaults.set(vaultId, { ...server.vaults.get(vaultId)!, deleted_at: server.now() });
    await syncSharedVaults(server.remote);
    expect(store().vaults.find((v) => v.id === vaultId)).toBeUndefined();
    expect(store().shared).toEqual({});
    // The spots it brought stay in Ben's saves.
    expect(
      store()
        .places.map((p) => p.name)
        .sort(),
    ).toEqual(['Artjuna', 'Bean Me Up', 'Cafe Cotinga']);
  });

  it('does not double a place two people added', async () => {
    const server = fakeServer();
    const [a] = store().addPlaces([spot('Artjuna', 15.6)]);
    const vaultId = store().createVault({ name: 'Goa', placeIds: [a] });
    server.vaults.set(vaultId, {
      id: vaultId,
      name: 'Goa',
      emoji: null,
      created_at: server.now(),
      deleted_at: null,
    });
    store().startSharing(vaultId, 'token');
    // Someone else added the same café separately.
    await server.remote.insertSpots([
      {
        id: 'other',
        vault_id: vaultId,
        name: 'Artjuna',
        city: 'Goa',
        country: null,
        country_code: null,
        category: 'cafe',
        lat: 15.6,
        lng: 73.8,
        address: null,
      },
    ]);
    await syncSharedVaults(server.remote);
    expect(store().places).toHaveLength(1);
    expect(names(vaultId)).toEqual(['Artjuna']);
  });

  it('leaving removes the vault here but never deletes it on the server', () => {
    store().joinSharedVault({ id: 'v1', name: 'Friends', createdAt: 0 });
    store().unshareVault('v1');
    expect(store().vaults).toEqual([]);
    expect(store().vaultSync.deleted).toEqual([]);
  });
});
