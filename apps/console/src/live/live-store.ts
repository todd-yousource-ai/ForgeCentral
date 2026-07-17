// The live-store: the small, stream-shaped store the shell wires so live-badged panels have a single
// freshness source. F0.6 (the BFF SSE channel + short-interval CrucibleQL polling) is DEFERRED by the
// product owner, and crdb Part B (the engine push-stream) is banked. So v1 exposes the INTERFACE and an
// honest status: with no channel connected the status is `unavailable` and panels render a staleness
// marker, never a fabricated "live" state or synthetic data. When F0.6 lands, its channel drives
// `set(...)` and the surfaces are unchanged (INV-CONSOLE-LIVE: shape now, push later).

export type LiveStatus =
  /** No channel configured yet (F0.6 deferred). Panels show the "not live" staleness marker. */
  | 'unavailable'
  /** A channel is opening. */
  | 'connecting'
  /** Connected and fresh. */
  | 'live'
  /** Connected but lagging past the freshness budget. */
  | 'stale';

export interface LiveState {
  readonly status: LiveStatus;
  /** Human reason for a non-live status (shown in the staleness marker). */
  readonly reason: string;
  /** ISO-ish last-update label, when a channel has delivered at least once. */
  readonly since?: string;
}

type Listener = (state: LiveState) => void;

const INITIAL: LiveState = {
  status: 'unavailable',
  reason: 'Live channel not enabled yet',
};

/** A dependency-free observable store (consumed by React via useSyncExternalStore). */
export class LiveStore {
  private state: LiveState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: LiveState = INITIAL) {
    this.state = initial;
  }

  getState = (): LiveState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replace the state and notify. The F0.6 channel calls this; nothing else fabricates a live state. */
  set(next: LiveState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /** Return to the deferred `unavailable` state (e.g. the last live-driving surface unmounted). */
  reset(): void {
    this.set(INITIAL);
  }
}

/** Whether a status should render a staleness marker (anything but a fresh, connected stream). */
export function isStale(status: LiveStatus): boolean {
  return status !== 'live';
}
