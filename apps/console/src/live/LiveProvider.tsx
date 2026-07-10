import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { LiveStore } from './live-store.js';
import type { LiveState } from './live-store.js';

// React binding for the live-store. The provider owns one store per app; `useLive()` subscribes a
// component to it via useSyncExternalStore (concurrent-safe). Surfaces read `status`/`reason` to render a
// staleness marker; they never read a data payload from here (the store carries freshness, not rows).

const LiveContext = createContext<LiveStore | null>(null);

export interface LiveProviderProps {
  readonly children: ReactNode;
  /** Inject a store (tests); defaults to a fresh store in the deferred `unavailable` state. */
  readonly store?: LiveStore;
}

export function LiveProvider({ children, store }: LiveProviderProps): ReactElement {
  const value = useMemo(() => store ?? new LiveStore(), [store]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** Subscribe to the live freshness state. Throws if used outside a LiveProvider. */
export function useLive(): LiveState {
  const store = useContext(LiveContext);
  if (store === null) {
    throw new Error('useLive must be used within a LiveProvider');
  }
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
