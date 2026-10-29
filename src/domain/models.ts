import { z } from 'zod';

/**
 * Domain models. Schemas double as runtime validators for anything that crosses a
 * trust boundary: persisted storage (which can be stale or corrupted) and API responses.
 */

export const CATEGORIES = [
  'food',
  'cafe',
  'nightlife',
  'sight',
  'nature',
  'stay',
  'shopping',
  'activity',
  'other',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const SOURCE_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'google_maps', 'web', 'manual'] as const;
export const SourcePlatformSchema = z.enum(SOURCE_PLATFORMS);
export type SourcePlatform = z.infer<typeof SourcePlatformSchema>;

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);

export const PlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().optional(),
  country: z.string().optional(),
  category: CategorySchema,
  lat: Latitude,
  lng: Longitude,
  address: z.string().optional(),
  note: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourcePlatform: SourcePlatformSchema,
  savedAt: z.number(),
  visitedAt: z.number().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

/** What callers provide when saving; the store assigns identity and timestamps. */
export type NewPlace = Omit<Place, 'id' | 'savedAt' | 'visitedAt'>;

export const TripDaySchema = z.object({
  day: z.number().int().positive(),
  placeIds: z.array(z.string()),
});
export type TripDay = z.infer<typeof TripDaySchema>;

export const TripSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string(),
  days: z.array(TripDaySchema).min(1),
  createdAt: z.number(),
});
export type Trip = z.infer<typeof TripSchema>;

/** A place the extractor found but the user hasn't confirmed yet. */
export const CandidateSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  country: z.string().optional(),
  category: CategorySchema,
  lat: Latitude.optional(),
  lng: Longitude.optional(),
  address: z.string().optional(),
  /** 0..1 — how sure the extractor is that this is a real, visitable place. */
  confidence: z.number().min(0).max(1),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export interface LatLng {
  lat: number;
  lng: number;
}
