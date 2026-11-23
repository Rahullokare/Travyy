import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useUserLocation } from '../useUserLocation';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const loc = jest.mocked(Location);
const fix = { coords: { latitude: 51.5, longitude: -0.1 } } as Location.LocationObject;

beforeEach(() => {
  jest.clearAllMocks();
  loc.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  loc.getLastKnownPositionAsync.mockResolvedValue(null);
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
});

describe('useUserLocation with permission already given', () => {
  it('stays quiet on open when the phone’s location is switched off', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(false);
    const { result } = await renderHook(() => useUserLocation());
    await act(async () => {});
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(result.current.location).toBeUndefined();
  });

  it('finds you on open, without Android’s settings dialog, when location is on', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(true);
    const { result } = await renderHook(() => useUserLocation());
    await act(async () => {});
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mayShowUserSettingsDialog: false }),
    );
    expect(result.current.location).toEqual({ lat: 51.5, lng: -0.1 });
  });

  it('may ask to turn location on when you tap to locate yourself', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(false);
    const { result } = await renderHook(() => useUserLocation());
    await act(async () => {
      await result.current.request();
    });
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mayShowUserSettingsDialog: true }),
    );
  });
});
