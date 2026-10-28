export type Category =
  | 'food'
  | 'cafe'
  | 'nightlife'
  | 'sight'
  | 'nature'
  | 'stay'
  | 'shopping'
  | 'activity'
  | 'other';

export type SourcePlatform = 'instagram' | 'tiktok' | 'youtube' | 'google_maps' | 'web' | 'manual';

export interface Place {
  id: string;
  name: string;
  city?: string;
  country?: string;
  category: Category;
  lat: number;
  lng: number;
  address?: string;
  note?: string;
  sourceUrl?: string;
  sourcePlatform: SourcePlatform;
  savedAt: number;
  visitedAt?: number;
}

/** A place the extractor found but the user hasn't confirmed yet. */
export interface Candidate {
  name: string;
  city?: string;
  country?: string;
  category: Category;
  lat?: number;
  lng?: number;
  address?: string;
  /** 0..1 — how sure the extractor is that this is a real, visitable place. */
  confidence: number;
}

export interface TripDay {
  day: number;
  placeIds: string[];
}

export interface Trip {
  id: string;
  name: string;
  city: string;
  days: TripDay[];
  createdAt: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
