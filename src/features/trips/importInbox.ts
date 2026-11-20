import { router } from 'expo-router';
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * A trip added from a shared link by someone who hadn't used the app yet. Finishing onboarding
 * resets navigation, so the trip is opened from the tabs layout once that has settled (the same
 * reason shares before onboarding are held, see capture/share/shareInbox.ts).
 */
export const useImportInbox = create<{
  tripId: string | null;
  /** The same for a vault added from a link (`places/vaultLink.ts`) or joined by invite. */
  vaultId: string | null;
  hold: (tripId: string) => void;
  holdVault: (vaultId: string) => void;
}>()((set) => ({
  tripId: null,
  vaultId: null,
  hold: (tripId) => set({ tripId }),
  holdVault: (vaultId) => set({ vaultId }),
}));

export function useOpenImportedTrip() {
  const tripId = useImportInbox((s) => s.tripId);
  const vaultId = useImportInbox((s) => s.vaultId);
  useEffect(() => {
    if (!tripId) return;
    useImportInbox.setState({ tripId: null });
    router.push(`/trip/${tripId}`);
  }, [tripId]);
  useEffect(() => {
    if (!vaultId) return;
    useImportInbox.setState({ vaultId: null });
    router.push({ pathname: '/vaults/[id]', params: { id: vaultId } });
  }, [vaultId]);
}
