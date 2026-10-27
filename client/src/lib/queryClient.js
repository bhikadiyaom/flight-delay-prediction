import { QueryClient } from '@tanstack/react-query';

// Decision 10: staleTime 5 min, retry 1, no refetch on window focus (protects the live-API quota).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
