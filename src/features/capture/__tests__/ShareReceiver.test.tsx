import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { ShareReceiver } from '@/features/capture/share/ShareReceiver';
import { useShareInbox } from '@/features/capture/share/shareInbox';
import { useAppStore } from '@/store';

jest.mock('expo-sharing', () => ({ getSharedPayloads: jest.fn(), clearSharedPayloads: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

const getSharedPayloads = Sharing.getSharedPayloads as jest.MockedFunction<typeof Sharing.getSharedPayloads>;
const replace = router.replace as jest.MockedFunction<typeof router.replace>;

const reel = [{ value: 'https://www.instagram.com/reel/C9xYz/?igsh=abc', shareType: 'url' as const }];

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.getState().reset();
  useShareInbox.setState({ pending: null });
});

describe('ShareReceiver', () => {
  it('opens the capture flow with the shared link and consumes the share', async () => {
    useAppStore.setState({ onboarded: true });
    getSharedPayloads.mockReturnValue(reel);
    await render(<ShareReceiver />);
    expect(replace).toHaveBeenCalledWith({
      pathname: '/add',
      params: { url: 'https://www.instagram.com/reel/C9xYz/' },
    });
    expect(Sharing.clearSharedPayloads).toHaveBeenCalled();
  });

  it('holds a first-launch share until onboarding is done', async () => {
    getSharedPayloads.mockReturnValue(reel);
    await render(<ShareReceiver />);
    expect(replace).toHaveBeenCalledWith('/');
    expect(useShareInbox.getState().pending).toEqual({ url: 'https://www.instagram.com/reel/C9xYz/' });
  });

  it('goes home when nothing was shared', async () => {
    useAppStore.setState({ onboarded: true });
    getSharedPayloads.mockReturnValue([]);
    await render(<ShareReceiver />);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('survives builds without the native share module (e.g. Expo Go)', async () => {
    useAppStore.setState({ onboarded: true });
    getSharedPayloads.mockImplementation(() => {
      throw new Error('Cannot find native module ExpoSharing');
    });
    await render(<ShareReceiver />);
    expect(replace).toHaveBeenCalledWith('/');
  });
});
