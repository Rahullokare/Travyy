import type { Place, Vault } from '@/domain/models';

/**
 * Vaults the person makes ("Cafés to try", "Goa weekend"), beside the country → city vault that
 * builds itself (`vault.ts`). A vault holds place ids, never copies, and is read against the
 * current saves, so a place deleted anywhere simply stops showing up.
 */

/** The Liked vault is derived from ❤ marks, not stored. It has a fixed id so routes can name it. */
export const LIKED_VAULT_ID = 'liked';
export const LIKED_EMOJI = '❤️';
/** Every save as one vault, so "all of it on a map" opens the same way as any other vault. */
export const ALL_VAULT_ID = 'all';
export const ALL_EMOJI = '🔖';

/** Shown on a vault with no emoji of its own. */
export const DEFAULT_VAULT_EMOJI = '📍';

/** A short pick list: an emoji keyboard is overkill for "what's this vault about". */
export const VAULT_EMOJI = ['📍', '☕', '🍜', '🍸', '🌅', '🏖️', '⛰️', '🏛️', '🛍️', '🎉', '💘', '✈️'] as const;

/** Starting points for a new vault's name, the way people already talk about their saves. */
export const VAULT_IDEAS = [
  { name: 'Cafés to try', emoji: '☕' },
  { name: 'Date nights', emoji: '💘' },
  { name: 'Weekend away', emoji: '🌅' },
  { name: 'Bucket list', emoji: '✈️' },
] as const;

/** The places in a vault, in its order, skipping any since deleted. */
export function placesInVault(vault: Pick<Vault, 'placeIds'>, places: Place[]): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return vault.placeIds.flatMap((id) => {
    const place = byId.get(id);
    return place ? [place] : [];
  });
}

/** Everything marked ❤, most recently liked first. */
export function likedPlaces(places: Place[]): Place[] {
  return places.filter((p) => p.likedAt).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0));
}

/** The vaults a place is in, for its detail screen. */
export function vaultsWith(vaults: Vault[], placeId: string): Vault[] {
  return vaults.filter((v) => v.placeIds.includes(placeId));
}

export interface VaultSummary {
  id: string;
  name: string;
  emoji: string;
  places: Place[];
  visited: number;
  /** Cities inside, biggest first, for the card's one-line "what's in here". */
  cities: string[];
  custom: boolean;
}

function summarise(id: string, name: string, emoji: string, places: Place[], custom: boolean): VaultSummary {
  const cityCounts = new Map<string, number>();
  for (const p of places) {
    const city = p.city?.trim();
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }
  return {
    id,
    name,
    emoji,
    places,
    visited: places.filter((p) => p.visitedAt).length,
    cities: [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    custom,
  };
}

/** One vault, custom or Liked, by route id. Undefined when it doesn't exist (deleted on another phone). */
export function vaultSummary(id: string, vaults: Vault[], places: Place[]): VaultSummary | undefined {
  if (id === LIKED_VAULT_ID) return summarise(id, 'Liked', LIKED_EMOJI, likedPlaces(places), false);
  if (id === ALL_VAULT_ID)
    return summarise(
      id,
      'All saves',
      ALL_EMOJI,
      [...places].sort((a, b) => b.savedAt - a.savedAt),
      false,
    );
  const vault = vaults.find((v) => v.id === id);
  if (!vault) return undefined;
  return summarise(
    vault.id,
    vault.name,
    vault.emoji ?? DEFAULT_VAULT_EMOJI,
    placesInVault(vault, places),
    true,
  );
}

/** The vaults the person made (and joined), newest first, for the Vaults tab and the vault pickers. */
export function customVaultSummaries(vaults: Vault[], places: Place[]): VaultSummary[] {
  return vaults.map((v) =>
    summarise(v.id, v.name, v.emoji ?? DEFAULT_VAULT_EMOJI, placesInVault(v, places), true),
  );
}

/** Liked first once anything is liked, then the vaults the person made, newest first. */
export function vaultSummaries(vaults: Vault[], places: Place[]): VaultSummary[] {
  const liked = likedPlaces(places);
  return [
    ...(liked.length ? [summarise(LIKED_VAULT_ID, 'Liked', LIKED_EMOJI, liked, false)] : []),
    ...vaults.map((v) =>
      summarise(v.id, v.name, v.emoji ?? DEFAULT_VAULT_EMOJI, placesInVault(v, places), true),
    ),
  ];
}
