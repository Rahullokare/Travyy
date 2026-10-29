import { useAppStore } from '@/store';

/**
 * Free-tier limits and entitlement checks live here so the billing provider
 * (RevenueCat) can replace `isPro` without touching any screen.
 */
export const FREE_LIMITS = { saves: 30, trips: 1 } as const;

export function useEntitlements() {
  const isPro = useAppStore((s) => s.isPro);
  const saves = useAppStore((s) => s.places.length);
  const trips = useAppStore((s) => s.trips.length);
  return {
    isPro,
    savesUsed: saves,
    canSave: (count: number) => isPro || saves + count <= FREE_LIMITS.saves,
    canCreateTrip: isPro || trips < FREE_LIMITS.trips,
  };
}
