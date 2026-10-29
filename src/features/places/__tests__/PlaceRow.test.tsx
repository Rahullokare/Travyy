import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Place } from '@/domain/models';
import { PlaceRow } from '@/features/places/components/PlaceRow';
import { tripAsText } from '@/features/trips/share';

const place: Place = {
  id: 'p1',
  name: 'Nishiki Market',
  city: 'Kyoto',
  category: 'food',
  lat: 35.005,
  lng: 135.7649,
  sourcePlatform: 'youtube',
  savedAt: 0,
};

describe('PlaceRow', () => {
  it('renders name and metadata and reports presses', async () => {
    const onPress = jest.fn();
    await render(<PlaceRow place={place} onPress={onPress} />);
    expect(screen.getByText('Nishiki Market')).toBeOnTheScreen();
    expect(screen.getByText('Food · Kyoto · YouTube')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Nishiki Market, Food' }));
    expect(onPress).toHaveBeenCalledWith(place);
  });

  it('announces visited places', async () => {
    await render(<PlaceRow place={{ ...place, visitedAt: 1 }} />);
    expect(screen.getByRole('button', { name: 'Nishiki Market, Food, visited' })).toBeOnTheScreen();
  });
});

describe('tripAsText', () => {
  it('formats a shareable itinerary with map links', () => {
    const text = tripAsText(
      { id: 't', name: 'Kyoto', city: 'Kyoto', createdAt: 0, days: [{ day: 1, placeIds: ['p1', 'gone'] }] },
      new Map([['p1', place]]),
    );
    expect(text).toContain('Day 1\n1. Nishiki Market — https://maps.google.com/?q=35.005,135.7649');
    expect(text).not.toContain('gone');
  });
});
