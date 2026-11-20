import { monthKey, useAppStore, type AppState } from '@/store';

/**
 * What each plan allows. Screens ask these questions and never read `isPro` themselves, so the
 * plans can change here without touching a screen. See docs/RESEARCH.md (4. Monetisation).
 *
 * Saving spots and splitting costs are never limited: they're how the app spreads. The free plan
 * limits what costs money to run (AI imports) and what's worth paying for (a second trip).
 */
export const FREE_LIMITS = { trips: 1, aiImportsPerMonth: 15 } as const;

export type Plan = 'free' | 'pass' | 'pro';

type EntitlementState = Pick<AppState, 'isPro' | 'tripPasses' | 'passUntil' | 'aiImports' | 'trips'>;

export function entitlementsOf(state: EntitlementState, now = Date.now()) {
  const passActive = state.passUntil > now;
  const unlimitedAi = state.isPro || passActive;
  const aiUsed = state.aiImports.month === monthKey(new Date(now)) ? state.aiImports.count : 0;
  // Trips added from a shared link are a gift from a friend, not a trip you planned.
  const planned = state.trips.filter((t) => !t.shared).length;
  const tripsAllowed = FREE_LIMITS.trips + state.tripPasses;
  const plan: Plan = state.isPro ? 'pro' : passActive ? 'pass' : 'free';
  return {
    plan,
    isPro: state.isPro,
    passUntil: passActive ? state.passUntil : undefined,
    canCreateTrip: state.isPro || planned < tripsAllowed,
    tripsPlanned: planned,
    tripsAllowed,
    canUseAi: unlimitedAi || aiUsed < FREE_LIMITS.aiImportsPerMonth,
    aiImportsUsed: aiUsed,
    /** Undefined when unlimited. */
    aiImportsLeft: unlimitedAi ? undefined : Math.max(0, FREE_LIMITS.aiImportsPerMonth - aiUsed),
  };
}

export type Entitlements = ReturnType<typeof entitlementsOf>;

export function useEntitlements(): Entitlements {
  const isPro = useAppStore((s) => s.isPro);
  const tripPasses = useAppStore((s) => s.tripPasses);
  const passUntil = useAppStore((s) => s.passUntil);
  const aiImports = useAppStore((s) => s.aiImports);
  const trips = useAppStore((s) => s.trips);
  return entitlementsOf({ isPro, tripPasses, passUntil, aiImports, trips });
}

/** For code that runs outside React (a mutation, a share handler). */
export function currentEntitlements(): Entitlements {
  return entitlementsOf(useAppStore.getState());
}
