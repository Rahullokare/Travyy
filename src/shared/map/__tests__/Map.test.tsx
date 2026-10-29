import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Map } from '@/shared/map';

describe('Map (native entry)', () => {
  it('shows a placeholder instead of crashing when MapLibre native code is absent (Expo Go)', async () => {
    // Jest, like Expo Go, has no MLRN native modules registered.
    await render(<Map markers={[{ id: 'a', coordinate: { lat: 1, lng: 2 }, color: '#f00', label: '1' }]} />);
    expect(screen.getByText(/The map needs the Travyy app build/)).toBeOnTheScreen();
  });
});
