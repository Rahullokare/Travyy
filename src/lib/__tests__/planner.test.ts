import { describe, expect, it } from '@jest/globals';
import { distanceMeters, orderRoute } from '../geo';
import { planTrip } from '../planner';
import { SAMPLE_PLACES } from '../sampleData';
import type { Place } from '../types';

const lisbon: Place[] = SAMPLE_PLACES.filter((p) => p.city === 'Lisbon').map((p, i) => ({
  ...p,
  id: `p${i}`,
  savedAt: 0,
}));

describe('distanceMeters', () => {
  it('matches a known distance (Lisbon → Porto ≈ 274 km)', () => {
    const d = distanceMeters({ lat: 38.7223, lng: -9.1393 }, { lat: 41.1579, lng: -8.6291 });
    expect(d / 1000).toBeGreaterThan(270);
    expect(d / 1000).toBeLessThan(280);
  });
});

describe('orderRoute', () => {
  it('visits points along a line in order', () => {
    const pts = [0.03, 0.01, 0.04, 0.0, 0.02].map((lng) => ({ lat: 0, lng }));
    expect(orderRoute(pts).map((p) => p.lng)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
  });
});

describe('planTrip', () => {
  it('uses every place exactly once', () => {
    const days = planTrip(lisbon, 3);
    const ids = days.flatMap((d) => d.placeIds).sort();
    expect(ids).toEqual(lisbon.map((p) => p.id).sort());
  });

  it('keeps days balanced', () => {
    const days = planTrip(lisbon, 3);
    expect(days).toHaveLength(3);
    for (const d of days) expect(d.placeIds.length).toBeLessThanOrEqual(Math.ceil(lisbon.length / 3));
  });

  it('groups Belém sights on the same day', () => {
    const days = planTrip(lisbon, 3);
    const belem = ['Pastéis de Belém', 'Torre de Belém'].map((n) => lisbon.find((p) => p.name === n)!.id);
    const dayOf = (id: string) => days.findIndex((d) => d.placeIds.includes(id));
    expect(dayOf(belem[0])).toBe(dayOf(belem[1]));
  });

  it('never makes more days than places', () => {
    expect(planTrip(lisbon.slice(0, 2), 5)).toHaveLength(2);
    expect(planTrip([], 3)).toEqual([{ day: 1, placeIds: [] }]);
  });
});
