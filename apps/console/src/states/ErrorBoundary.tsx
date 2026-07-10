import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { ErrorState } from './States.js';

// A render error boundary around the surface outlet. A thrown render error becomes the explicit error
// state (Section 9), not a white screen. It never surfaces a stack trace to the operator; the message is
// generic and the reset re-renders the children. Reported to the app log seam by the caller if desired.

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Called once when an error is caught (for logging). */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <ErrorState
          title="Something went wrong rendering this surface."
          code="ConsoleRenderError"
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
