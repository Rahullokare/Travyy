import type { Place } from './types';

/**
 * A realistic starter collection so a new user sees the map, city groups and
 * trip planner working in the first ten seconds — before they share anything.
 */
export const SAMPLE_PLACES: Omit<Place, 'id' | 'savedAt'>[] = [
  { name: 'Time Out Market', city: 'Lisbon', country: 'Portugal', category: 'food', lat: 38.7069, lng: -9.1459, sourcePlatform: 'instagram', note: 'Try the bifana stall' },
  { name: 'Pastéis de Belém', city: 'Lisbon', country: 'Portugal', category: 'cafe', lat: 38.6975, lng: -9.2033, sourcePlatform: 'tiktok', note: 'Go before 10am, queue gets long' },
  { name: 'Miradouro da Senhora do Monte', city: 'Lisbon', country: 'Portugal', category: 'sight', lat: 38.7192, lng: -9.1326, sourcePlatform: 'instagram', note: 'Sunset spot' },
  { name: 'LX Factory', city: 'Lisbon', country: 'Portugal', category: 'shopping', lat: 38.7032, lng: -9.1789, sourcePlatform: 'tiktok' },
  { name: 'Torre de Belém', city: 'Lisbon', country: 'Portugal', category: 'sight', lat: 38.6916, lng: -9.216, sourcePlatform: 'youtube' },
  { name: 'Park Bar', city: 'Lisbon', country: 'Portugal', category: 'nightlife', lat: 38.7105, lng: -9.1477, sourcePlatform: 'instagram', note: 'Rooftop on a car park' },
  { name: 'Castelo de São Jorge', city: 'Lisbon', country: 'Portugal', category: 'sight', lat: 38.7139, lng: -9.1335, sourcePlatform: 'tiktok' },
  { name: 'Cervejaria Ramiro', city: 'Lisbon', country: 'Portugal', category: 'food', lat: 38.7206, lng: -9.1357, sourcePlatform: 'instagram', note: 'Garlic prawns + steak sandwich for dessert' },
  { name: 'Fushimi Inari Taisha', city: 'Kyoto', country: 'Japan', category: 'sight', lat: 34.9671, lng: 135.7727, sourcePlatform: 'tiktok', note: 'Hike to the top for fewer crowds' },
  { name: 'Arashiyama Bamboo Grove', city: 'Kyoto', country: 'Japan', category: 'nature', lat: 35.017, lng: 135.6713, sourcePlatform: 'instagram' },
  { name: 'Nishiki Market', city: 'Kyoto', country: 'Japan', category: 'food', lat: 35.005, lng: 135.7649, sourcePlatform: 'youtube' },
  { name: '% Arabica Higashiyama', city: 'Kyoto', country: 'Japan', category: 'cafe', lat: 34.9985, lng: 135.7809, sourcePlatform: 'instagram' },
  { name: 'Kiyomizu-dera', city: 'Kyoto', country: 'Japan', category: 'sight', lat: 34.9949, lng: 135.785, sourcePlatform: 'tiktok' },
];
