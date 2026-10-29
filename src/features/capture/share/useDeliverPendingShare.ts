import { router } from 'expo-router';
import { useEffect } from 'react';
import { useShareInbox } from './shareInbox';

/**
 * Delivers a share that arrived before onboarding. Mounted in the tabs layout, which
 * only exists once onboarding is done and the protected-route switch has settled;
 * pushing earlier (e.g. from the root layout) gets wiped by that navigation reset.
 */
export function useDeliverPendingShare() {
  const pending = useShareInbox((s) => s.pending);
  useEffect(() => {
    if (!pending) return;
    const content = useShareInbox.getState().take();
    if (content) router.push({ pathname: '/add', params: { ...content } });
  }, [pending]);
}
