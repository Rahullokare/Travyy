import { QueryClient } from '@tanstack/react-query';

/**
 * Network state (extraction, geocoding, later: sync) goes through React Query for
 * retries, cancellation and loading states. Local app data lives in Zustand.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
