import type { ReactElement, ReactNode } from 'react';

// The four explicit cross-cutting states of TRD-CONSOLE-00 Section 9. Every surface renders one of these
// rather than a blank panel or fabricated data: loading (skeleton), empty (an honest "no data"), error
// (the engine's sanitized typed error + a request id, never a stack trace), and stale (a partial/streamed
// panel that has fallen behind rather than silently freezing). Styles are token-only (shell.css).

export interface LoadingStateProps {
  /** What is loading (announced to assistive tech). */
  readonly label?: string;
}

/** A skeleton panel. `role=status` + `aria-busy` announce the pending read. */
export function LoadingState({ label = 'Loading' }: LoadingStateProps): ReactElement {
  return (
    <div className="fcx-state fcx-state--loading" role="status" aria-busy="true">
      <div className="fcx-skeleton fcx-skeleton--line" />
      <div className="fcx-skeleton fcx-skeleton--line" />
      <div className="fcx-skeleton fcx-skeleton--block" />
      <span className="fcx-visually-hidden">{label}…</span>
    </div>
  );
}

export interface EmptyStateProps {
  /** The honest "no data" headline. */
  readonly title: string;
  /** Optional guidance on why it is empty / what would fill it. */
  readonly hint?: ReactNode;
  /** Optional action (e.g. a primary CTA) rendered under the hint. */
  readonly action?: ReactNode;
}

/** A real empty state. Never a fabricated placeholder row. */
export function EmptyState({ title, hint, action }: EmptyStateProps): ReactElement {
  return (
    <div className="fcx-state fcx-state--empty" role="note">
      <p className="fcx-state__title">{title}</p>
      {hint !== undefined ? <p className="fcx-state__hint">{hint}</p> : null}
      {action !== undefined ? <div className="fcx-state__action">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  /** Human copy for the failure (mapped from the engine taxonomy by the caller). */
  readonly title: string;
  /** The engine's typed error code (e.g. PolicyError), surfaced for support. */
  readonly code?: string;
  /** The engine request id, surfaced for support correlation. */
  readonly requestId?: string;
  /** Retry handler; the button is shown only when provided. */
  readonly onRetry?: () => void;
}

/** The engine's sanitized error, with the raw code + request id available for support. No stack traces. */
export function ErrorState({ title, code, requestId, onRetry }: ErrorStateProps): ReactElement {
  return (
    <div className="fcx-state fcx-state--error" role="alert">
      <p className="fcx-state__title">{title}</p>
      {code !== undefined || requestId !== undefined ? (
        <p className="fcx-state__meta">
          {code !== undefined ? <span className="fcx-state__code">{code}</span> : null}
          {requestId !== undefined ? (
            <span className="fcx-state__req">request {requestId}</span>
          ) : null}
        </p>
      ) : null}
      {onRetry !== undefined ? (
        <button type="button" className="fcx-btn" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export interface StaleBannerProps {
  /** Why the panel is stale (e.g. "reconnecting", "live channel unavailable"). */
  readonly reason: string;
  /** Optional last-updated hint. */
  readonly since?: string;
}

/** A staleness marker on a partial/streamed panel (Section 9: never silently freeze). */
export function StaleBanner({ reason, since }: StaleBannerProps): ReactElement {
  return (
    <div className="fcx-stale" role="status">
      <span className="fcx-stale__dot" aria-hidden="true" />
      <span>
        {reason}
        {since !== undefined ? ` · last updated ${since}` : ''}
      </span>
    </div>
  );
}
