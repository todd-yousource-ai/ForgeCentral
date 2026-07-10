import { QueryClient } from '@tanstack/react-query';

// The query layer (TanStack Query). One client for the app; every surface read is a query keyed by its
// binding (later). Defaults are conservative for an operator console: no window-focus refetch storms, a
// bounded retry, and a short stale window (live surfaces refresh through the live-store, not query
// polling). The cache is ephemeral browser state only, never an authority (INV-CONSOLE-NO-2ND-DB).

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
