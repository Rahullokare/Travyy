import type { LatLng } from '@/domain/models';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Rough walking time at 4.8 km/h. */
export function walkingMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/**
 * Order stops into a short walking route: nearest-neighbour from `start`
 * (or the westernmost stop), then a 2-opt pass to untangle crossings.
 */
export function orderRoute<T extends LatLng>(stops: T[], start?: LatLng): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  let current: LatLng = start ?? remaining.reduce((w, p) => (p.lng < w.lng ? p : w));
  const route: T[] = [];
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    remaining.forEach((p, i) => {
      const d = distanceMeters(current, p);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    route.push(next);
    current = next;
  }
  return twoOpt(route);
}

function routeLength(route: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceMeters(route[i - 1], route[i]);
  return total;
}

function twoOpt<T extends LatLng>(route: T[]): T[] {
  let best = route;
  let bestLen = routeLength(best);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const len = routeLength(candidate);
        if (len + 1 < bestLen) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function totalRouteMeters(route: LatLng[]): number {
  return routeLength(route);
}
