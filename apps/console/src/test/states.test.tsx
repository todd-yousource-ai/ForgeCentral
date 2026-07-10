import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EmptyState, ErrorState, LoadingState, StaleBanner } from '../states/States.js';
import { ErrorBoundary } from '../states/ErrorBoundary.js';

// The four explicit states (Section 9) plus the render boundary. Each announces itself to assistive tech
// and none fabricates data.

describe('cross-cutting states', () => {
  it('loading announces a busy status', () => {
    render(<LoadingState label="Loading policies" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading policies…')).toBeInTheDocument();
  });

  it('empty shows an honest title + hint, no data', () => {
    render(<EmptyState title="No policies yet" hint="Nothing to show." />);
    expect(screen.getByText('No policies yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show.')).toBeInTheDocument();
  });

  it('error surfaces the engine code + request id and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="The read was denied."
        code="PolicyError"
        requestId="req-9"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The read was denied.');
    expect(screen.getByText('PolicyError')).toBeInTheDocument();
    expect(screen.getByText('request req-9')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('stale shows the reason', () => {
    render(<StaleBanner reason="reconnecting" since="12:00" />);
    expect(screen.getByRole('status')).toHaveTextContent('reconnecting');
    expect(screen.getByRole('status')).toHaveTextContent('last updated 12:00');
  });

  it('the error boundary converts a render throw into the error state', () => {
    const Boom = (): never => {
      throw new Error('kaboom');
    };
    const spy = vi.fn();
    render(
      <ErrorBoundary onError={spy}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong rendering this surface.',
    );
    expect(spy).toHaveBeenCalledOnce();
  });
});
