import type { ReactElement, ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { createQueryClient } from '../query/client.js';
import { LiveProvider } from '../live/LiveProvider.js';
import type { LiveStore } from '../live/live-store.js';
import type { OperatorDto } from '../auth/api.js';

// Shared test harness: render a tree inside the same providers the app mounts (QueryClient + Router +
// LiveProvider), with the initial route and (optionally) an injected live-store controllable by the test.

export const TEST_OPERATOR: OperatorDto = {
  subject: 'auth0|op-123',
  email: 'operator@example.gov',
  tier: 'Admin',
};

export interface HarnessOptions {
  readonly route?: string;
  readonly liveStore?: LiveStore;
}

export function renderWithProviders(ui: ReactElement, options: HarnessOptions = {}): RenderResult {
  const { route = '/', liveStore } = options;
  const client = createQueryClient();
  function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
          <LiveProvider {...(liveStore !== undefined ? { store: liveStore } : {})}>
            {children}
          </LiveProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
