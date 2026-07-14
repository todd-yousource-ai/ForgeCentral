import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { App } from '../App.js';
import { createQueryClient } from '../query/client.js';
import { TEST_OPERATOR } from './render.js';

// The auth gate (App): /auth/me drives whether the login screen or the shell renders. The client gate is
// UX only; the engine re-authorizes under the operator Principal regardless.

function renderApp(): ReactElement {
  const client = createQueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the auth gate', () => {
  it('shows the login screen when unauthenticated (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input === '/auth/me')
          return Promise.resolve(jsonResponse(401, { error: 'unauthenticated' }));
        throw new Error(`unexpected fetch ${input}`);
      }),
    );
    render(renderApp());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('renders the shell when a session resolves to an operator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input === '/auth/me') {
          return Promise.resolve(jsonResponse(200, { operator: TEST_OPERATOR }));
        }
        // The home Overview surface reads its (empty) connectivity Sankey once the shell mounts.
        if (input.startsWith('/api/overview/sankey')) {
          return Promise.resolve(
            jsonResponse(200, {
              sources: [],
              vtzs: [],
              destinations: [],
              sourceEdges: [],
              destEdges: [],
            }),
          );
        }
        throw new Error(`unexpected fetch ${input}`);
      }),
    );
    render(renderApp());
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
  });
});
