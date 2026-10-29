import { describe, expect, it, jest } from '@jest/globals';
import { warmUpApi } from '@/shared/lib/useWarmUpApi';

jest.mock('@/shared/config/env', () => ({
  env: { apiUrl: 'https://travyy-api.test', mapStyleUrl: 'https://tiles.test/s.json', appVariant: 'preview' },
}));

describe('warmUpApi', () => {
  it('pings /health once, then waits before pinging again', async () => {
    const fetchMock = jest.fn(async () => new Response('{"ok":true}')) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;
    warmUpApi();
    warmUpApi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock as jest.Mock).mock.calls[0][0])).toBe('https://travyy-api.test/health');
  });
});
