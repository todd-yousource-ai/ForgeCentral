// apps/console/src/test/policies-surface.test.tsx -- IP-CONSOLE-05 P5.3 the grouped read-only surface.
//
// Proves the surface half of INV-CONSOLE-POLICIES-REAL: the tenant's policies render grouped by VTZ in
// collapsible accordions the operator expands to a real table (the 07-*.png columns); every cell derives
// from the engine record (action badges are exactly the four-action lattice, logging exactly the three
// levels); the honest states (loading / engine error / no match) render instead of a fabricated grid; the
// Create control is present-but-disabled (authoring is P5.4); and an empty tenant renders honest empties.

import type { PolicyRow, PolicyZoneGroup } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PoliciesSurface,
  networkSummary,
  restrictionsSummary,
  scopeSummary,
} from '../surfaces/PoliciesSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const policy = (overrides: Partial<PolicyRow> = {}): PolicyRow => ({
  id: '11111111-1111-1111-1111-111111111111',
  vtz: 'YouSource.Corp',
  name: 'contain-egress',
  version: '1.2.0',
  lifecycle: 'published',
  description: 'quarantine agent egress',
  rules: [
    {
      source: { kind: 'agent', selectorKind: 'exact', selectorValue: 'demo-agent' },
      destination: { kind: 'network', selectorKind: 'cidr', selectorValue: '10.8.0.0/16' },
      action: 'quarantine',
    },
  ],
  network: { protocols: ['https'], ports: '443' },
  restrictions: {
    scheduleDays: ['mon', 'tue'],
    scheduleStartMinute: 540,
    scheduleEndMinute: 1020,
    activeFrom: null,
    activeUntil: 999,
    geo: [],
    tags: ['PHI'],
  },
  logging: 'full',
  appliedTo: [{ endpointCn: 'host-01.corp', agent: 'demo-agent' }],
  maxClassification: 'confidential',
  ...overrides,
});

const zones: readonly PolicyZoneGroup[] = [
  { vtz: 'YouSource.Corp', policies: [policy()] },
  {
    vtz: 'YouSource.Public',
    policies: [
      policy({
        id: '22222222-2222-2222-2222-222222222222',
        vtz: 'YouSource.Public',
        name: 'allow-dns',
        version: '1.0.0',
        lifecycle: 'draft',
        rules: [
          {
            source: { kind: 'agent', selectorKind: 'glob', selectorValue: '*' },
            destination: { kind: 'uri', selectorKind: 'exact', selectorValue: 'dns' },
            action: 'permit',
          },
        ],
        network: { protocols: [], ports: '' },
        restrictions: {
          scheduleDays: [],
          scheduleStartMinute: null,
          scheduleEndMinute: null,
          activeFrom: null,
          activeUntil: null,
          geo: [],
          tags: [],
        },
        logging: 'off',
      }),
    ],
  },
];

const emptyTree = { zones: [], truncated: false };

function stubFetch(opts: { policiesStatus?: number; policiesBody?: unknown } = {}): void {
  const fetchMock = vi.fn((input: string) => {
    if (input.startsWith('/api/policies')) {
      return Promise.resolve(jsonResponse(opts.policiesStatus ?? 200, opts.policiesBody ?? zones));
    }
    if (input.startsWith('/api/vtz/tree')) {
      return Promise.resolve(jsonResponse(200, emptyTree));
    }
    throw new Error(`unexpected fetch ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Policies surface (P5.3) groups the real policies by VTZ', () => {
  it('renders one collapsible group per zone with a policy-count badge, collapsed by default', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    const corp = await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    expect(corp).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'YouSource.Public, 1 policy' })).toBeInTheDocument();
    // Collapsed: the table is not in the tree until the operator expands the group.
    expect(screen.queryByText('contain-egress')).not.toBeInTheDocument();
  });

  it('expands a zone to the policy table with the 07 columns off the engine record', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    const corp = await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    fireEvent.click(corp);
    // Name + version chip, the Quarantine action badge (the lattice), and Full logging all render.
    expect(await screen.findByText('contain-egress')).toBeInTheDocument();
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
    expect(screen.getByText('Quarantine')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('agent:demo-agent -> network:10.8.0.0/16')).toBeInTheDocument();
    expect(screen.getByText('HTTPS 443')).toBeInTheDocument();
    // The column headers are the real 07-*.png columns.
    for (const header of [
      'Name',
      'Scope',
      'Protocol / Ports',
      'Action',
      'Restrictions',
      'Logging',
      'Status',
    ]) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('offers exactly the engine values: a draft policy reads Permit + Off, badged as a draft', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    const pub = await screen.findByRole('button', { name: 'YouSource.Public, 1 policy' });
    fireEvent.click(pub);
    expect(await screen.findByText('allow-dns')).toBeInTheDocument();
    expect(screen.getByText('Permit')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    // An unrestricted network qualifier reads "any", never a fabricated port.
    expect(screen.getByText('any')).toBeInTheDocument();
  });

  it('search narrows a complete dataset and opens the matching group', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search policies' }), {
      target: { value: 'allow-dns' },
    });
    // Only the Public zone matches, and an active search opens the matching group in place.
    await waitFor(() => expect(screen.getByText('allow-dns')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'YouSource.Corp, 1 policy' }),
    ).not.toBeInTheDocument();
  });

  it('renders the Create control present but disabled (authoring is the next step)', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    const create = screen.getByRole('button', { name: '+ Create Policy' });
    expect(create).toBeDisabled();
  });

  it('an empty tenant renders an honest empty state, never a fabricated policy', async () => {
    stubFetch({ policiesBody: [] });
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    expect(await screen.findByText('No policies match')).toBeInTheDocument();
    expect(screen.getByText('No policies have been authored yet.')).toBeInTheDocument();
  });

  it('degrades to an error state with a retry when the read fails', async () => {
    stubFetch({ policiesStatus: 503 });
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    // The query retries once (~1s backoff) before it settles to error, so wait past that.
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the policies.')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('the cell summaries derive from the record (pure projections)', () => {
  it('summarizes a single-rule scope as source -> destination', () => {
    expect(scopeSummary(policy())).toBe('agent:demo-agent -> network:10.8.0.0/16');
  });

  it('collapses a multi-rule scope to a source/target count', () => {
    const multi = policy({
      rules: [
        {
          source: { kind: 'agent', selectorKind: 'exact', selectorValue: 'a' },
          destination: { kind: 'uri', selectorKind: 'exact', selectorValue: 'x' },
          action: 'deny',
        },
        {
          source: { kind: 'user', selectorKind: 'exact', selectorValue: 'b' },
          destination: { kind: 'uri', selectorKind: 'exact', selectorValue: 'x' },
          action: 'deny',
        },
      ],
    });
    expect(scopeSummary(multi)).toBe('2 sources -> 1 targets');
  });

  it('reads an unrestricted network as "any" and a restricted one as protocol + ports', () => {
    expect(networkSummary(policy({ network: { protocols: [], ports: '' } }))).toBe('any');
    expect(networkSummary(policy())).toBe('HTTPS 443');
  });

  it('flags an absolute-window expiry rather than fabricating a date', () => {
    expect(restrictionsSummary(policy())).toContain('expires');
    expect(restrictionsSummary(policy())).toContain('scheduled');
    expect(restrictionsSummary(policy())).toContain('PHI');
  });
});
