import { z } from 'zod';
import { PlaceSchema, type Place } from '@/domain/models';

/** A row of `public.places` (supabase/migrations). Times are ISO strings there, milliseconds here. */
const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  country_code: z.string().nullable(),
  category: z.string(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  note: z.string().nullable(),
  source_url: z.string().nullable(),
  source_platform: z.string(),
  saved_at: z.string(),
  visited_at: z.string().nullable(),
  // Added with vaults (2026-11-20); rows from before have no such column in older caches.
  liked_at: z.string().nullable().optional(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type PlaceRow = z.infer<typeof RowSchema>;
/** What the phone sends: the server fills in the owner and `updated_at`. */
export type PlaceUpload = Omit<PlaceRow, 'updated_at'>;

const iso = (ms: number) => new Date(ms).toISOString();

export function toRow(place: Place): PlaceUpload {
  return {
    id: place.id,
    name: place.name,
    city: place.city ?? null,
    country: place.country ?? null,
    country_code: place.countryCode ?? null,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    address: place.address ?? null,
    note: place.note ?? null,
    source_url: place.sourceUrl ?? null,
    source_platform: place.sourcePlatform,
    saved_at: iso(place.savedAt),
    visited_at: place.visitedAt ? iso(place.visitedAt) : null,
    liked_at: place.likedAt ? iso(place.likedAt) : null,
    // Uploading a place means it exists: this also brings back one deleted on another phone.
    deleted_at: null,
  };
}

export interface RemoteChange {
  id: string;
  updatedAt: string;
  /** Undefined when the row was deleted. */
  place?: Place;
}

/** What came back from the server is untrusted like anything else off the network: a row that doesn't parse is skipped. */
export function fromRow(raw: unknown): RemoteChange | undefined {
  const row = RowSchema.safeParse(raw);
  if (!row.success) return undefined;
  const r = row.data;
  if (r.deleted_at) return { id: r.id, updatedAt: r.updated_at };
  const place = PlaceSchema.safeParse({
    id: r.id,
    name: r.name,
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    countryCode: r.country_code ?? undefined,
    category: r.category,
    lat: r.lat,
    lng: r.lng,
    address: r.address ?? undefined,
    note: r.note ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    sourcePlatform: r.source_platform,
    savedAt: Date.parse(r.saved_at),
    visitedAt: r.visited_at ? Date.parse(r.visited_at) : undefined,
    likedAt: r.liked_at ? Date.parse(r.liked_at) : undefined,
  });
  return place.success ? { id: r.id, updatedAt: r.updated_at, place: place.data } : undefined;
}
