import { afterEach, describe, expect, it } from '@jest/globals';
import { redirectParams, takeReturnPath } from '@/features/auth/session';

describe('the URL Google sends back', () => {
  it('reads the code from the query', () => {
    expect(redirectParams('travyy://auth-callback?code=abc-123')).toEqual({ code: 'abc-123' });
  });

  it('reads errors from the query or the fragment', () => {
    expect(
      redirectParams('https://travyy.app/auth-callback#error=access_denied&error_description=User+said+no'),
    ).toEqual({ error: 'access_denied', error_description: 'User said no' });
    expect(redirectParams('exp://192.168.1.2:8081/--/auth-callback?error=server_error&x=%E2%9C%93')).toEqual({
      error: 'server_error',
      x: '✓',
    });
  });

  it('survives junk', () => {
    expect(redirectParams('travyy://auth-callback')).toEqual({});
    expect(redirectParams('travyy://auth-callback?bad=%E0%A4%A&code=ok')).toEqual({ code: 'ok' });
  });
});

describe('where web sign-in returns to', () => {
  const store = new Map<string, string>();
  const g = globalThis as { sessionStorage?: unknown };
  afterEach(() => {
    store.clear();
    delete g.sessionStorage;
  });
  const set = (v: string) => {
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    store.set('travyy-auth-return', v);
  };

  it('opens the page sign-in started from, once', () => {
    set('/join-vault?t=abc');
    expect(takeReturnPath()).toBe('/join-vault?t=abc');
    expect(takeReturnPath()).toBe('/');
  });

  it('never leaves the app', () => {
    for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      set(evil);
      expect(takeReturnPath()).toBe('/');
    }
  });

  it('goes home without storage', () => {
    expect(takeReturnPath()).toBe('/');
  });
});
