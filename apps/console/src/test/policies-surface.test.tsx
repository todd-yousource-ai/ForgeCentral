// apps/console/src/test/policies-surface.test.tsx -- IP-CONSOLE-05 P5.3/P5.4 the Policies surface.
//
// Proves the surface half of INV-CONSOLE-POLICIES-REAL: the tenant's policies render grouped by VTZ in
// collapsible accordions the operator expands to a real table (the 07-*.png columns); every cell derives
// from the engine record (action badges are exactly the four-action lattice, logging exactly the three
// levels); the honest states (loading / engine error / no match) render instead of a fabricated grid;
// Create opens the authoring form and Save-as-Draft posts the built ruleset; Delete is behind a critical
// confirm; and an empty tenant renders honest empties.

import type { PolicyRow, PolicyZoneGroup } from '@forge/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PoliciesSurface,
  networkSummary,
  restrictionsSummary,
  scopeSummary,
} from '../surfaces/PoliciesSurface.js';
import { portsValid } from '../surfaces/PolicyForm.js';
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

const tree = {
  zones: [
    {
      id: 'YouSource.Corp',
      name: 'YouSource.Corp',
      parent: 'YouSource',
      zoneType: 'standard',
      lifecycle: 'published',
      microSegmentation: true,
      telemetry: 'full',
      reauthIntervalHours: 8,
      ownPostures: [],
      effectivePostures: [],
      subZoneCount: 0,
    },
  ],
  truncated: false,
};

const catalog = [
  {
    name: 'demo-agent',
    kind: 'agent',
    selectorKind: 'exact',
    selectorValue: 'demo-agent',
    attributes: [],
    description: '',
    tags: [],
    lifecycle: 'published',
  },
  {
    name: 'corp-subnet',
    kind: 'network',
    selectorKind: 'cidr',
    selectorValue: '10.8.0.0/16',
    attributes: [],
    description: '',
    tags: [],
    lifecycle: 'published',
  },
];

interface StubOpts {
  policiesStatus?: number;
  policiesBody?: unknown;
  commandStatus?: number;
}

function stubFetch(opts: StubOpts = {}): { commands: Array<{ url: string; body: unknown }> } {
  const commands: Array<{ url: string; body: unknown }> = [];
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (input.startsWith('/api/policies')) {
      if (init?.method === 'POST') {
        const raw = typeof init.body === 'string' ? init.body : '';
        commands.push({ url: input, body: JSON.parse(raw) });
        return Promise.resolve(
          jsonResponse(opts.commandStatus ?? 200, {
            id: 'p-new',
            version: '1.0.0',
            lifecycle: 'draft',
            breaking: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse(opts.policiesStatus ?? 200, opts.policiesBody ?? zones));
    }
    if (input.startsWith('/api/vtz/tree')) {
      return Promise.resolve(jsonResponse(200, tree));
    }
    if (input.startsWith('/api/objects')) {
      return Promise.resolve(jsonResponse(200, catalog));
    }
    throw new Error(`unexpected fetch ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { commands };
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

  it('opens the authoring form with the closed-enum controls when Create is clicked (P5.4)', async () => {
    stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Policy' }));
    const form = await screen.findByRole('form', { name: 'Create a policy' });
    expect(form).toBeInTheDocument();
    // The Action control offers exactly the four lattice actions; Logging exactly the three levels.
    const actions = [...screen.getByLabelText('Action').querySelectorAll('option')].map(
      (o) => o.textContent,
    );
    expect(actions).toEqual(['Permit', 'Monitor', 'Quarantine', 'Deny']);
    const levels = [...screen.getByLabelText('Logging Level').querySelectorAll('option')].map(
      (o) => o.textContent,
    );
    expect(levels).toEqual(['Full', 'Sampled', 'Off']);
    // Incomplete (no subjects/targets): Save as Draft is disabled.
    expect(screen.getByRole('button', { name: 'Save as Draft' })).toBeDisabled();
  });

  it('authors a draft through the audited route with the built cross-product ruleset', async () => {
    const bff = stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Policy' }));
    const form = await screen.findByRole('form', { name: 'Create a policy' });
    const f = within(form);

    fireEvent.change(f.getByLabelText('Policy Name'), { target: { value: 'new-policy' } });
    fireEvent.change(f.getByLabelText('Zone'), { target: { value: 'YouSource.Corp' } });
    // Select a subject + a target from the real object catalog.
    const pick = (label: string, value: string): void => {
      const select = f.getByLabelText<HTMLSelectElement>(label);
      for (const opt of select.options) opt.selected = opt.value === value;
      fireEvent.change(select);
    };
    pick('Subjects', 'demo-agent');
    pick('Targets', '10.8.0.0/16');
    fireEvent.change(f.getByLabelText('Action'), { target: { value: 'quarantine' } });

    fireEvent.click(f.getByRole('button', { name: 'Save as Draft' }));
    await waitFor(() => expect(bff.commands).toHaveLength(1));
    const body = bff.commands[0]?.body as {
      name: string;
      vtz: string;
      rules: {
        source: { selectorValue: string };
        destination: { selectorValue: string };
        action: string;
      }[];
    };
    expect(bff.commands[0]?.url).toBe('/api/policies');
    expect(body.name).toBe('new-policy');
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0]?.source.selectorValue).toBe('demo-agent');
    expect(body.rules[0]?.destination.selectorValue).toBe('10.8.0.0/16');
    expect(body.rules[0]?.action).toBe('quarantine');
  });

  it('deletes a policy behind a critical confirm gate', async () => {
    const bff = stubFetch();
    renderWithProviders(<PoliciesSurface />, { route: '/policies' });
    const corp = await screen.findByRole('button', { name: 'YouSource.Corp, 1 policy' });
    fireEvent.click(corp);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    // A confirm gate opens; only the explicit confirm commits the delete.
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(bff.commands.some((c) => c.url === '/api/policies/delete')).toBe(true),
    );
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

describe('portsValid enforces the canonical port form', () => {
  it('accepts empty (unrestricted), single ports, and start-end ranges', () => {
    expect(portsValid('')).toBe(true);
    expect(portsValid('443')).toBe(true);
    expect(portsValid('80, 443, 8080-8090')).toBe(true);
  });

  it('rejects out-of-range ports, inverted ranges, and non-numeric entries', () => {
    expect(portsValid('0')).toBe(false);
    expect(portsValid('70000')).toBe(false);
    expect(portsValid('9000-8000')).toBe(false);
    expect(portsValid('http')).toBe(false);
  });
});
