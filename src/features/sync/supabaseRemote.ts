import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaceUpload } from './placeRows';
import type { PlacesRemote } from './syncPlaces';
import type { SharedVaultsRemote } from './syncSharedVaults';
import type { VaultsRemote } from './syncVaults';
import type { VaultUpload } from './vaultRows';
import { newId } from '@/shared/lib/id';

/**
 * `public.places` and `public.vaults` over Supabase's API. Row-level security scopes every call to
 * the signed-in account, and the owner column defaults to it, so nothing here names a user.
 */
export function supabasePlaces(client: SupabaseClient): PlacesRemote {
  return rowsRemote<PlaceUpload>(client, 'places');
}

/** Only your own rows: vaults you joined are readable too, but they sync as shared spots. */
export function supabaseVaults(client: SupabaseClient, userId: string): VaultsRemote {
  return rowsRemote<VaultUpload>(client, 'vaults', userId);
}

/** `vaults`, `vault_members`, `vault_spots` and `join_vault`, for vaults shared with friends. */
export function supabaseSharedVaults(client: SupabaseClient, userId: string): SharedVaultsRemote {
  return {
    async info(ids) {
      const { data, error } = await client
        .from('vaults')
        .select('id, name, emoji, created_at, deleted_at')
        .in('id', ids);
      if (error) throw error;
      return data ?? [];
    },
    async memberCounts(ids) {
      const { data, error } = await client.from('vault_members').select('vault_id').in('vault_id', ids);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { vault_id: string }[]) {
        counts[row.vault_id] = (counts[row.vault_id] ?? 0) + 1;
      }
      return counts;
    },
    async insertSpots(rows) {
      const { error } = await client
        .from('vault_spots')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
    async removeSpots(ids) {
      const { error } = await client
        .from('vault_spots')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    async pullSpots(vaultId, since, offset, limit) {
      let query = client.from('vault_spots').select('*').eq('vault_id', vaultId);
      if (since) query = query.gte('updated_at', since);
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return data ?? [];
    },
    // Anyone in the vault can read the link, so friends can bring their friends.
    async inviteToken(vaultId) {
      const { data, error } = await client
        .from('vaults')
        .select('invite_token')
        .eq('id', vaultId)
        .maybeSingle();
      if (error) throw error;
      return (data as { invite_token?: string } | null)?.invite_token;
    },
    async join(token) {
      const { data, error } = await client.rpc('join_vault', { token });
      if (error) throw error;
      return data as string;
    },
    async leave(vaultId) {
      const { error } = await client
        .from('vault_members')
        .delete()
        .eq('vault_id', vaultId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    async stopSharing(vaultId) {
      const { error } = await client.from('vault_members').delete().eq('vault_id', vaultId);
      if (error) throw error;
      // Sharing again later starts from what's in the vault then, not from these.
      const { error: spots } = await client
        .from('vault_spots')
        .update({ deleted_at: new Date().toISOString() })
        .eq('vault_id', vaultId)
        .is('deleted_at', null);
      if (spots) throw spots;
      const { error: rotate } = await client
        .from('vaults')
        .update({ invite_token: newToken() })
        .eq('id', vaultId);
      if (rotate) throw rotate;
    },
  };
}

function rowsRemote<Upload extends { id: string }>(
  client: SupabaseClient,
  table: 'places' | 'vaults',
  ownerId?: string,
) {
  const rows = () => client.from(table);
  return {
    async upsert(batch: Upload[]) {
      const { error } = await rows().upsert(batch, { onConflict: 'id' });
      if (error) throw error;
    },
    async softDelete(ids: string[]) {
      const { error } = await rows().update({ deleted_at: new Date().toISOString() }).in('id', ids);
      if (error) throw error;
    },
    async pull(since: string | undefined, offset: number, limit: number): Promise<unknown[]> {
      let query = rows().select('*');
      if (ownerId) query = query.eq('user_id', ownerId);
      if (since) query = query.gte('updated_at', since);
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return data ?? [];
    },
  };
}

/** A fresh invite token. Cancels every link made with the old one. */
const newToken = () => newId();
