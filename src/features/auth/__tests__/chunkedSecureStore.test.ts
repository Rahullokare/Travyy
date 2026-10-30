import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { chunkedSecureStore } from '@/features/auth/supabase';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock('@/shared/config/env', () => ({ env: {} }));

const KEY = 'sb-project-auth-token';

describe('chunkedSecureStore', () => {
  beforeEach(() => mockStore.clear());

  it('splits a large session into chunks under the SecureStore limit and joins it back', async () => {
    const session = JSON.stringify({
      access_token: 'a'.repeat(3000),
      refresh_token: 'r',
      user: { email: 'é@x.io' },
    });
    await chunkedSecureStore.setItem(KEY, session);
    expect(mockStore.get(`${KEY}.n`)).toBe('2');
    expect([...mockStore.values()].every((v) => v.length <= 2048)).toBe(true);
    expect(await chunkedSecureStore.getItem(KEY)).toBe(session);
  });

  it('drops leftover chunks when the session shrinks, and removes everything on sign-out', async () => {
    await chunkedSecureStore.setItem(KEY, 'x'.repeat(5000));
    await chunkedSecureStore.setItem(KEY, 'small');
    expect([...mockStore.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
    expect(await chunkedSecureStore.getItem(KEY)).toBe('small');
    await chunkedSecureStore.removeItem(KEY);
    expect(mockStore.size).toBe(0);
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });

  it('treats a missing chunk as no session', async () => {
    await chunkedSecureStore.setItem(KEY, 'y'.repeat(4000));
    mockStore.delete(`${KEY}.1`);
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });
});
