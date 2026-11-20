import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Trip } from '@/domain/models';
import { monthKey, sanitize, useAppStore } from '@/store';
import { catalogue, grant, TRIP_PASS_DAYS } from '../billing';
import { currentEntitlements, entitlementsOf, FREE_LIMITS } from '../entitlements';

const trip = (id: string, shared?: boolean): Trip => ({
  id,
  name: id,
  city: 'Lisbon',
  days: [{ day: 1, placeIds: [] }],
  createdAt: 1,
  shared,
});
const NOW = new Date(2026, 10, 16, 12).getTime();
const base = { isPro: false, tripPasses: 0, passUntil: 0, aiImports: { month: '', count: 0 }, trips: [] };

beforeEach(() => {
  useAppStore.getState().reset();
});

describe('free plan', () => {
  it('includes one planned trip', () => {
    expect(entitlementsOf(base, NOW).canCreateTrip).toBe(true);
    expect(entitlementsOf({ ...base, trips: [trip('a')] }, NOW).canCreateTrip).toBe(false);
  });

  it('does not count trips added from a shared link', () => {
    const e = entitlementsOf({ ...base, trips: [trip('a', true), trip('b', true)] }, NOW);
    expect(e.canCreateTrip).toBe(true);
    expect(e.tripsPlanned).toBe(0);
  });

  it('allows a monthly number of AI imports, then says no', () => {
    const month = monthKey(new Date(NOW));
    const nearly = { ...base, aiImports: { month, count: FREE_LIMITS.aiImportsPerMonth - 1 } };
    expect(entitlementsOf(nearly, NOW)).toMatchObject({ canUseAi: true, aiImportsLeft: 1 });
    const used = { ...base, aiImports: { month, count: FREE_LIMITS.aiImportsPerMonth } };
    expect(entitlementsOf(used, NOW)).toMatchObject({ canUseAi: false, aiImportsLeft: 0 });
  });

  it('starts a fresh allowance each month', () => {
    const lastMonth = { ...base, aiImports: { month: '2026-10', count: 99 } };
    expect(entitlementsOf(lastMonth, NOW)).toMatchObject({
      canUseAi: true,
      aiImportsLeft: FREE_LIMITS.aiImportsPerMonth,
    });
  });
});

describe('paid plans', () => {
  it('Pro lifts every limit', () => {
    const month = monthKey(new Date(NOW));
    const e = entitlementsOf(
      { ...base, isPro: true, trips: [trip('a'), trip('b')], aiImports: { month, count: 500 } },
      NOW,
    );
    expect(e).toMatchObject({ plan: 'pro', canCreateTrip: true, canUseAi: true, aiImportsLeft: undefined });
  });

  it('a Trip Pass adds one trip for good and unlimited AI for 30 days', () => {
    useAppStore.setState({ trips: [trip('a')] });
    expect(currentEntitlements().canCreateTrip).toBe(false);
    grant('trip_pass');
    const state = useAppStore.getState();
    expect(currentEntitlements()).toMatchObject({
      plan: 'pass',
      canCreateTrip: true,
      aiImportsLeft: undefined,
    });
    expect(state.passUntil - Date.now()).toBeGreaterThan((TRIP_PASS_DAYS - 1) * 86_400_000);

    const later = entitlementsOf({ ...state, trips: [trip('a'), trip('b')] }, state.passUntil + 1);
    expect(later).toMatchObject({ plan: 'free', canCreateTrip: false, tripsAllowed: 2 });
    expect(entitlementsOf({ ...state, trips: [trip('a')] }, state.passUntil + 1).canCreateTrip).toBe(true);
  });

  it('a subscription grants Pro', () => {
    grant('pro_yearly');
    expect(currentEntitlements().plan).toBe('pro');
  });

  it('shows India prices in India and dollars elsewhere', () => {
    expect(catalogue('IN').find((p) => p.id === 'pro_yearly')?.price).toBe('₹999');
    expect(catalogue('US').find((p) => p.id === 'pro_yearly')?.price).toBe('$29.99');
    expect(catalogue(undefined).map((p) => p.id)).toEqual(['trip_pass', 'pro_yearly', 'pro_monthly']);
  });
});

describe('the store', () => {
  it('counts AI imports per month', () => {
    useAppStore.getState().countAiImport();
    useAppStore.getState().countAiImport();
    expect(useAppStore.getState().aiImports).toEqual({ month: monthKey(), count: 2 });
    useAppStore.setState({ aiImports: { month: '2020-01', count: 40 } });
    useAppStore.getState().countAiImport();
    expect(useAppStore.getState().aiImports.count).toBe(1);
  });

  it('drops corrupt entitlement data instead of trusting it', () => {
    const clean = sanitize({ tripPasses: 'lots', passUntil: -5, aiImports: { month: 5 } });
    expect(clean).toMatchObject({ tripPasses: 0, passUntil: 0, aiImports: { month: '', count: 0 } });
  });

  it('imports a shared trip in its day order, reusing saved places', () => {
    const store = useAppStore.getState();
    const spot = {
      name: 'Ramiro',
      lat: 38.72,
      lng: -9.13,
      category: 'food',
      sourcePlatform: 'manual',
    } as const;
    const [existing] = store.addPlaces([spot]);
    const id = store.importTrip({
      name: 'Shared',
      city: 'Lisbon',
      days: [[spot], [{ ...spot, name: 'Park Bar', lat: 38.71 }]],
    });
    const state = useAppStore.getState();
    const imported = state.trips.find((t) => t.id === id);
    expect(state.places).toHaveLength(2);
    expect(imported?.shared).toBe(true);
    expect(imported?.days[0].placeIds).toEqual([existing]);
    expect(imported?.days[1].placeIds).toHaveLength(1);
  });
});
