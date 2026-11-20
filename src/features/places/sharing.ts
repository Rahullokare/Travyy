import * as Linking from 'expo-linking';
import { authEnabled } from '@/features/auth/session';
import { supabase } from '@/features/auth/supabase';
import { supabaseSharedVaults } from '@/features/sync/supabaseRemote';
import { parseVaultInfo, type SharedVaultsRemote } from '@/features/sync/syncSharedVaults';
import { syncNow } from '@/features/sync/useAccountSync';
import { webBase } from '@/features/trips/shareLink';
import { useAppStore } from '@/store';

/**
 * Vaults built together with friends: invite, join, leave, stop. The syncing itself is
 * `features/sync/syncSharedVaults.ts`; this is what the screens call.
 */

/** Shared vaults need an account on the server; a build without Supabase can only send copies. */
export const sharingAvailable = authEnabled;

export class SharingError extends Error {}

async function remote(): Promise<SharedVaultsRemote> {
  if (!supabase) throw new SharingError('Shared vaults aren’t available in this version of the app.');
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new SharingError('Sign in to share a vault with friends.');
  return supabaseSharedVaults(supabase, userId);
}

/** The link friends open to join. On the web app when there is one, so it works without Travyy installed. */
export function inviteUrl(token: string, base = webBase()): string {
  return base
    ? `${base}/join-vault?t=${encodeURIComponent(token)}`
    : Linking.createURL('/join-vault', { queryParams: { t: token } });
}

/**
 * Makes a vault shared (the first time) and returns its invite link. Uploads the vault first: the
 * server makes the invite token when it first sees the vault.
 */
export async function inviteToVault(vaultId: string): Promise<string> {
  const api = await remote();
  const share = useAppStore.getState().shared[vaultId];
  if (share?.inviteToken) return inviteUrl(share.inviteToken);
  await syncNow();
  const token = await api.inviteToken(vaultId);
  if (!token)
    throw new SharingError('Couldn’t reach Travyy to make the invite. Check your connection and try again.');
  // Someone who joined can pass the link on; only the owner's vault becomes "shared by me".
  if (share?.role !== 'member') {
    useAppStore.getState().startSharing(vaultId, token);
    void syncNow();
  }
  return inviteUrl(token);
}

/** Joins a vault from an invite link and returns its id once its spots are here. */
export async function joinVault(token: string): Promise<string> {
  const api = await remote();
  let vaultId: string;
  try {
    vaultId = await api.join(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new SharingError(
      /no longer valid/i.test(message)
        ? 'This invite link has expired. Ask for a new one.'
        : 'Couldn’t join right now. Check your connection and try again.',
    );
  }
  const store = useAppStore.getState();
  if (!store.shared[vaultId] && !store.vaults.some((v) => v.id === vaultId)) {
    const [row] = (await api.info([vaultId])).map(parseVaultInfo);
    if (!row) throw new SharingError('Couldn’t open this vault. Try the link again.');
    store.joinSharedVault({
      id: row.id,
      name: row.name,
      emoji: row.emoji ?? undefined,
      createdAt: Date.parse(row.created_at),
    });
  }
  await syncNow();
  return vaultId;
}

/** A member leaves: the vault goes from this phone, the spots stay in their saves. */
export async function leaveVault(vaultId: string): Promise<void> {
  await (await remote()).leave(vaultId);
  useAppStore.getState().unshareVault(vaultId);
}

/** The owner stops sharing: everyone else is taken out and old invite links stop working. */
export async function stopSharingVault(vaultId: string): Promise<void> {
  await (await remote()).stopSharing(vaultId);
  useAppStore.getState().unshareVault(vaultId);
}
