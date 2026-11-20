import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SignInScreen } from '@/features/auth/screens/SignInScreen';
import {
  enabledProviders,
  sendEmailCode,
  signInWithProvider,
  verifyEmailCode,
} from '@/features/auth/session';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ isFocused: () => true }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/features/auth/session', () => ({
  sendEmailCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  signInWithProvider: jest.fn(),
  enabledProviders: jest.fn(),
}));

const send = jest.mocked(sendEmailCode);
const verify = jest.mocked(verifyEmailCode);
const google = jest.mocked(signInWithProvider);
const providers = jest.mocked(enabledProviders);

const WRONG_ADDRESS = "That email address isn't valid. Check it and try again.";
const WRONG_CODE = 'That code is wrong or has expired. Check it, or send a new one.';

const submitEmail = async (email = 'asha@example.com') => {
  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email);
  await fireEvent.press(screen.getByText('Email me a code'));
};

const submitCode = async (code = '123456') => {
  await fireEvent.changeText(await screen.findByPlaceholderText('123456'), code);
  await fireEvent.press(screen.getByText('Sign in'));
};

beforeEach(() => {
  jest.clearAllMocks();
  send.mockResolvedValue(undefined);
  verify.mockResolvedValue(undefined);
  providers.mockResolvedValue(new Set());
  google.mockResolvedValue(true);
});

describe('SignInScreen errors', () => {
  it.each(['Unable to validate email address: invalid format', 'Email address "a@b.co" is invalid'])(
    'blames the address, not a code, when sending fails with: %s',
    async (error) => {
      send.mockRejectedValue(new Error(error));
      await render(<SignInScreen />);
      await submitEmail();
      expect(await screen.findByText(WRONG_ADDRESS)).toBeTruthy();
      expect(screen.queryByText(WRONG_CODE)).toBeNull();
    },
  );

  it('keeps Supabase wording for other send failures, even if the address says "invalid"', async () => {
    const error = 'Email address "invalid@b.co" cannot be used as it is not authorized';
    send.mockRejectedValue(new Error(error));
    await render(<SignInScreen />);
    await submitEmail('invalid@b.co');
    expect(await screen.findByText(error)).toBeTruthy();
  });

  it('blames the code when checking it fails', async () => {
    verify.mockRejectedValue(new Error('Token has expired or is invalid'));
    await render(<SignInScreen />);
    await submitEmail();
    await submitCode();
    expect(await screen.findByText(WRONG_CODE)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows the rate limit and connection messages at either step', async () => {
    send.mockRejectedValueOnce(new Error('email rate limit exceeded'));
    await render(<SignInScreen />);
    await submitEmail();
    expect(await screen.findByText('Too many codes sent. Wait a minute and try again.')).toBeTruthy();

    send.mockRejectedValueOnce(new Error('Network request failed'));
    await submitEmail();
    expect(await screen.findByText('No connection. Check your internet and try again.')).toBeTruthy();
  });

  it('signs in and closes on the right code', async () => {
    await render(<SignInScreen />);
    await submitEmail(' Asha@Example.com ');
    await submitCode();
    await screen.findByText('Sign in');
    expect(send).toHaveBeenCalledWith('asha@example.com');
    expect(verify).toHaveBeenCalledWith('asha@example.com', '123456');
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('SignInScreen with Google', () => {
  it('hides Google until it is switched on in the project', async () => {
    await render(<SignInScreen />);
    await screen.findByText('Email me a code');
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it('signs in with Google and closes', async () => {
    providers.mockResolvedValue(new Set(['email', 'google']));
    await render(<SignInScreen />);
    await fireEvent.press(await screen.findByText('Continue with Google'));
    await screen.findByText('Continue with Google');
    expect(google).toHaveBeenCalledWith('google', undefined);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('stays open when the Google sheet is closed', async () => {
    providers.mockResolvedValue(new Set(['google']));
    google.mockResolvedValue(false);
    await render(<SignInScreen />);
    await fireEvent.press(await screen.findByText('Continue with Google'));
    await screen.findByText('Continue with Google');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('explains a provider that is switched off', async () => {
    providers.mockResolvedValue(new Set(['google']));
    google.mockRejectedValue(new Error('Unsupported provider: provider is not enabled'));
    await render(<SignInScreen />);
    await fireEvent.press(await screen.findByText('Continue with Google'));
    expect(
      await screen.findByText('Google sign-in isn’t switched on yet. Use your email for now.'),
    ).toBeTruthy();
  });
});
