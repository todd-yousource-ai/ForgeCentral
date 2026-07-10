import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getMe, logout } from './api.js';
import type { OperatorDto } from './api.js';

// The session hook: the shell's gate. `useSession` reads /auth/me through the query layer (the operator
// or null when unauthenticated); `useLogout` clears the session and invalidates the cached identity so
// the shell falls back to the login screen. The query key is stable so a completed login can seed it.

export const SESSION_QUERY_KEY = ['auth', 'me'] as const;

export interface SessionResult {
  readonly operator: OperatorDto | null | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export function useSession(): SessionResult {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getMe,
    staleTime: 30_000,
    retry: 0,
  });
  return {
    operator: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}

export function useLogout(): () => void {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      client.setQueryData<OperatorDto | null>(SESSION_QUERY_KEY, null);
    },
  });
  return () => {
    mutation.mutate();
  };
}
