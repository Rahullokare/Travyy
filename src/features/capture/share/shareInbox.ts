import { create } from 'zustand';
import type { SharedContent } from './parseShare';

/**
 * Holds a share that arrived before the user finished onboarding, so it isn't lost:
 * the root navigator forwards it to the capture screen once onboarding completes.
 * Deliberately not persisted: a share is a one-off intent.
 */
interface ShareInbox {
  pending: SharedContent | null;
  hold: (content: SharedContent) => void;
  take: () => SharedContent | null;
}

export const useShareInbox = create<ShareInbox>()((set, get) => ({
  pending: null,
  hold: (content) => set({ pending: content }),
  take: () => {
    const content = get().pending;
    set({ pending: null });
    return content;
  },
}));
