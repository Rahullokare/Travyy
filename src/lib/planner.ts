import { distanceMeters, orderRoute } from './geo';
import type { Place, TripDay } from './types';

/**
 * Turn a pile of saved places into a day-by-day plan.
 *
 * Places are grouped into `dayCount` geographic clusters (so each day stays in
 * one neighbourhood), clusters are rebalanced so no day is overloaded, and
 * each day is ordered into a short walking route.
 */
export function planTrip(places: Place[], dayCount: number): TripDay[] {
  const days = Math.max(1, Math.min(dayCount, places.length || 1));
  if (places.length === 0) return [{ day: 1, placeIds: [] }];

  const clusters = balance(kMeans(places, days), Math.ceil(places.length / days));

  // Days flow west → east so consecutive days are near each other.
  const ordered = clusters
    .filter((c) => c.length > 0)
    .map((c) => orderRoute(c))
    .sort((a, b) => meanLng(a) - meanLng(b));

  return ordered.map((route, i) => ({ day: i + 1, placeIds: route.map((p) => p.id) }));
}

function meanLng(ps: Place[]): number {
  return ps.reduce((s, p) => s + p.lng, 0) / ps.length;
}

function kMeans(places: Place[], k: number): Place[][] {
  // Deterministic farthest-point seeding: stable plans for the same input.
  const seeds = [places.reduce((w, p) => (p.lng < w.lng ? p : w))];
  while (seeds.length < k) {
    let far = places[0];
    let farD = -1;
    for (const p of places) {
      const d = Math.min(...seeds.map((s) => distanceMeters(s, p)));
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    seeds.push(far);
  }
  let centres = seeds.map((s) => ({ lat: s.lat, lng: s.lng }));
  let assignment: number[] = [];

  for (let iter = 0; iter < 25; iter++) {
    const next = places.map((p) => nearestIndex(p, centres));
    const changed = next.some((c, i) => c !== assignment[i]);
    assignment = next;
    centres = centres.map((c, ci) => {
      const members = places.filter((_, i) => assignment[i] === ci);
      if (members.length === 0) return c;
      return {
        lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
        lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
      };
    });
    if (!changed) break;
  }
  return centres.map((_, ci) => places.filter((_, i) => assignment[i] === ci));
}

function nearestIndex(p: { lat: number; lng: number }, centres: { lat: number; lng: number }[]): number {
  let best = 0;
  let bestD = Infinity;
  centres.forEach((c, i) => {
    const d = distanceMeters(p, c);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Move the outermost stops of overloaded days into the nearest day with room. */
function balance(clusters: Place[][], cap: number): Place[][] {
  const result = clusters.map((c) => [...c]);
  const centre = (c: Place[]) => ({
    lat: c.reduce((s, p) => s + p.lat, 0) / Math.max(1, c.length),
    lng: c.reduce((s, p) => s + p.lng, 0) / Math.max(1, c.length),
  });

  // Empty clusters (duplicate seeds) take from the largest day first.
  for (const empty of result.filter((c) => c.length === 0)) {
    const largest = result.reduce((a, b) => (b.length > a.length ? b : a));
    if (largest.length > 1) empty.push(largest.pop()!);
  }

  for (let guard = 0; guard < 200; guard++) {
    const over = result.findIndex((c) => c.length > cap);
    if (over === -1) break;
    const c = centre(result[over]);
    // Evict the stop furthest from its own day's centre.
    result[over].sort((a, b) => distanceMeters(a, c) - distanceMeters(b, c));
    const moving = result[over].pop()!;
    const targets = result
      .map((cl, i) => ({ i, d: cl.length ? distanceMeters(moving, centre(cl)) : 0, size: cl.length }))
      .filter((t) => t.i !== over && t.size < cap)
      .sort((a, b) => a.d - b.d);
    if (targets.length === 0) {
      result[over].push(moving);
      break;
    }
    result[targets[0].i].push(moving);
  }
  return result;
}
