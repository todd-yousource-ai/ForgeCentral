// apps/console/src/test/vtz-surface.test.tsx -- IP-CONSOLE-02 V2.4 the Active VTZs grid.
//
// Proves the surface half of INV-CONSOLE-VTZ-REAL: the grid renders the real zones the BFF returned from
// the crdb VTZ system of record, the card focal is the archetype badge + the joined risk band with NO
// trust score anywhere, a zone the risk join does not cover shows no band rather than a defaulted green,
// the honest states (loading / engine error / no match) render instead of a fabricated grid, and selecting
// a zone reaches its own-vs-effective posture inside the 3-click budget.

import { vtzId } from '@forge/contracts';
import type { OverviewSankey, VtzTree, VtzZone } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VtzSurface, highSensitivityCount, matchZones } from '../surfaces/VtzSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** The eleven-domain matrix as the engine emits it; `network` varies so own and effective can differ. */
const postures = (network: 'deny' | 'permit-deny-risky' = 'permit-deny-risky') =>
  [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'privilege-escalation', posture: 'deny', floor: false },
    { domain: 'kernel-module', posture: 'deny', floor: false },
    { domain: 'credential-store', posture: 'deny', floor: false },
    { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
    { domain: 'ordinary-network', posture: network, floor: false },
    { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
    { domain: 'memory', posture: 'permit-deny-risky', floor: false },
    { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
    { domain: 'device', posture: 'permit-deny-risky', floor: false },
  ] as VtzZone['ownPostures'];

/** Only the two catastrophic-floor domains deny; nothing beyond the floor is tightened. */
const floorOnlyPostures = () =>
  [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
  ] as VtzZone['ownPostures'];

const zone = (overrides: Partial<VtzZone> = {}): VtzZone => ({
  id: vtzId('YouSource.Corp.Finance'),
  name: 'YouSource.Corp.Finance',
  parent: 'YouSource.Corp',
  zoneType: 'standard',
  lifecycle: 'published',
  microSegmentation: true,
  telemetry: 'full',
  reauthIntervalHours: 8,
  ownPostures: postures(),
  effectivePostures: postures('deny'),
  subZoneCount: 3,
  ...overrides,
});

const tree: VtzTree = {
  zones: [
    zone(),
    zone({
      id: vtzId('YouSource.Public'),
      name: 'YouSource.Public',
      parent: 'YouSource',
      zoneType: 'public',
      lifecycle: 'draft',
      subZoneCount: 0,
      ownPostures: floorOnlyPostures(),
      effectivePostures: floorOnlyPostures(),
    }),
  ],
  truncated: false,
};

/** The Overview graph carrying a risk band for ONE of the two zones (the other has no decisions). */
const sankey: Partial<OverviewSankey> = {
  vtzs: [
    {
      id: 'YouSource.Corp.Finance',
      name: 'YouSource.Corp.Finance',
      profile: 'observe',
      risk: { level: 'red', escalate: 2, candidate: 0, observe: 0 },
    },
  ],
};

/** One recorded authoring request (the audited write path the editor drives). */
interface SentCommand {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

/**
 * Stub fetch: the VTZ tree, the zone detail (per id), the Overview join, and the four authoring routes.
 * Returns the list every mutation was recorded into, so a test can assert WHAT was committed.
 */
function stubFetch(opts: {
  readonly treeStatus?: number;
  readonly treeBody?: unknown;
  readonly detailBody?: unknown;
  readonly detailById?: Readonly<Record<string, unknown>>;
  readonly mutationStatus?: number;
  readonly mutationBody?: unknown;
}): SentCommand[] {
  const sent: SentCommand[] = [];
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (input.startsWith('/api/vtz/tree')) {
      return Promise.resolve(jsonResponse(opts.treeStatus ?? 200, opts.treeBody ?? tree));
    }
    if (input.startsWith('/api/vtz/detail')) {
      const id = decodeURIComponent(
        new URL(input, 'http://localhost').searchParams.get('id') ?? '',
      );
      const scripted = opts.detailById?.[id];
      if (scripted !== undefined) return Promise.resolve(jsonResponse(200, scripted));
      return Promise.resolve(
        jsonResponse(200, opts.detailBody ?? { zone: tree.zones[0], ancestors: [] }),
      );
    }
    if (input.startsWith('/api/overview/sankey')) {
      return Promise.resolve(jsonResponse(200, sankey));
    }
    // The authoring view embeds the distribution panel (FD.7c); its convergence read is handled here
    // so it never lands in the authoring-command `sent` log the assertions count.
    if (input.startsWith('/api/vtz/convergence')) {
      return Promise.resolve(jsonResponse(200, { hasBundle: false, version: 0, members: [] }));
    }
    if (input.startsWith('/api/vtz')) {
      sent.push({
        url: input,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(
        jsonResponse(
          opts.mutationStatus ?? 200,
          opts.mutationBody ?? { id: 'YouSource.Corp.Finance', lifecycle: 'published' },
        ),
      );
    }
    throw new Error(`unexpected fetch ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return sent;
}

/** A LEAF zone: no sub-zones, so the engine will move it (a zone with descendants cannot be re-scoped). */
const leafZone = zone({
  id: vtzId('YouSource.Public'),
  name: 'YouSource.Public',
  parent: 'YouSource',
  zoneType: 'public',
  lifecycle: 'draft',
  subZoneCount: 0,
});

/** Open the editor for the leaf Public zone and wait for the form to render. */
async function openPublicEditor(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Trust zone YouSource.Public' })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Trust zone YouSource.Public' }));
  await waitFor(() => {
    expect(screen.getByLabelText('VTZ type')).toBeInTheDocument();
  });
}

/** Open the editor for the Finance zone and wait for the form to render. */
async function openFinanceEditor(): Promise<void> {
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
    ).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }));
  await waitFor(() => {
    expect(screen.getByLabelText('VTZ type')).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the VTZ surface (V2.4)', () => {
  it('renders the real zones from GET /api/vtz/tree as cards', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Trust zone YouSource.Public' })).toBeInTheDocument();
  });

  it('shows the KPI row without an Avg Trust card and with no trust score anywhere', async () => {
    stubFetch({});
    const { container } = renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Total VTZs' })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: 'High-sensitivity zones' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /avg trust/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/trust score/i);
    expect(container.querySelector('.fc-score-ring')).toBeNull();
  });

  it('joins the risk band by zone id and shows NO band for a zone the join does not cover', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    // Finance has decisions -> Critical. Public has none -> no band at all (not a defaulted Nominal).
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nominal')).not.toBeInTheDocument();
    expect(screen.queryByText('Elevated')).not.toBeInTheDocument();
  });

  it('renders the member + policy counts as an explicit absence, never a fabricated zero', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    });
    // Two zones x two unavailable counts.
    expect(screen.getAllByText('Not available')).toHaveLength(4);
  });

  it('narrows the grid by search and states the match count against the true total', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Public' }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search zones' }), {
      target: { value: 'finance' },
    });
    expect(
      screen.queryByRole('button', { name: 'Trust zone YouSource.Public' }),
    ).not.toBeInTheDocument();
    // A narrowed grid always says what it is a subset OF, so it is never read as the whole store.
    expect(screen.getByText('Showing 1 of 2 zone(s)')).toBeInTheDocument();
  });

  it('shows an honest empty state when no zone matches the search', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Public' }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search zones' }), {
      target: { value: 'nothing-matches-this' },
    });
    expect(screen.getByText('No zones match')).toBeInTheDocument();
  });

  it('degrades to an error state with a retry when the tree read fails', async () => {
    stubFetch({ treeStatus: 503, treeBody: { error: 'unavailable' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the trust zones.')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders an empty tenant honestly rather than a fabricated zone', async () => {
    stubFetch({ treeBody: { zones: [], truncated: false } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByText('No trust zones yet')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Trust zone/ })).not.toBeInTheDocument();
  });

  it('badges a partial tree instead of presenting a prefix as the whole store', async () => {
    stubFetch({ treeBody: { ...tree, truncated: true } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByText('Partial tree')).toBeInTheDocument();
    });
  });

  it('reaches the zone configuration in one click and authors NO policy there', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();

    // The seven authoring fields, and nothing that grants or denies: a VTZ is the policy EDGE, and the
    // rules that govern its members are authored on the Policies surface.
    expect(screen.getByLabelText('VTZ name')).toBeInTheDocument();
    expect(screen.getByLabelText('VTZ type')).toBeInTheDocument();
    expect(screen.getByLabelText('Parent VTZ (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Session duration (hours)')).toBeInTheDocument();
    expect(screen.getByLabelText('Telemetry mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Micro-segmentation')).toBeInTheDocument();
    expect(screen.queryByText(/Locked: catastrophic floor/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Posture for ordinary-network')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /rules that govern its members are authored against it on the Policies surface/,
      ),
    ).toBeInTheDocument();
  });

  it('offers every archetype, including Quarantine and Observability', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();
    const options = Array.from(screen.getByLabelText('VTZ type').querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['Standard', 'Quarantine', 'Isolation', 'Public', 'Observability']);
    // The retired archetype is gone.
    expect(options).not.toContain('Trusted');
  });

  it('prompts for a selection rather than guessing one when Configure is opened directly', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Configure' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configure' }));
    expect(screen.getByText('Select a zone to configure')).toBeInTheDocument();
  });
});

describe('the VTZ surface derivations (pure)', () => {
  it('counts a zone as high-sensitivity only when it denies BEYOND the catastrophic floor', () => {
    // Every zone denies governed-egress + execution; counting the floor would make the KPI meaningless.
    const flooredOnly = zone({ effectivePostures: floorOnlyPostures() });
    const tightened = zone({ effectivePostures: postures('deny') });
    expect(highSensitivityCount([flooredOnly])).toBe(0);
    expect(highSensitivityCount([tightened])).toBe(1);
    expect(highSensitivityCount([flooredOnly, tightened])).toBe(1);
  });

  it('matches zones case-insensitively by dotted name and passes everything through when blank', () => {
    const zones = tree.zones;
    expect(matchZones(zones, '').length).toBe(2);
    expect(matchZones(zones, '  ').length).toBe(2);
    expect(matchZones(zones, 'FINANCE').map((z) => z.name)).toEqual(['YouSource.Corp.Finance']);
    expect(matchZones(zones, 'yousource').length).toBe(2);
    expect(matchZones(zones, 'zzz')).toEqual([]);
  });
});

describe('the VTZ authoring editor (V2.5)', () => {
  it('commits an edit only after a confirm, and sends the operator edited matrix', async () => {
    const sent = stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();

    fireEvent.change(screen.getByLabelText('Session duration (hours)'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Nothing is committed until the operator authorizes the audited act.
    expect(sent).toHaveLength(0);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Save changes to YouSource.Corp.Finance?');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.method).toBe('PUT');
    expect(sent[0]?.url).toBe('/api/vtz/YouSource.Corp.Finance');
    const spec = sent[0]?.body as { reauthIntervalHours: number; ownPostures: unknown[] };
    expect(spec.reauthIntervalHours).toBe(12);
    // No policy is authored from this surface; the engine fail-closes every unauthored domain.
    expect(spec.ownPostures).toEqual([]);
  });

  it('abandons the act when the confirm is cancelled (nothing is committed)', async () => {
    const sent = stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('moves the zone as part of Save when the parent changes, naming the move in the confirm', async () => {
    const sent = stubFetch({
      detailBody: { zone: leafZone, ancestors: [] },
      mutationBody: { id: 'YouSource.Corp.Public', lifecycle: 'draft' },
    });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openPublicEditor();

    // Re-parenting is an ordinary field edit: pick a parent, press Save. No separate re-scope act.
    fireEvent.change(screen.getByLabelText('Parent VTZ (optional)'), {
      target: { value: 'YouSource.Corp.Finance' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // Folding the move into Save must not hide it: the confirm names where the zone lands.
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Save YouSource.Public and move it to YouSource.Corp.Finance.Public?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    // One operator act, but the engine has no combined verb: settings first, then the move, so the
    // moved record carries the new settings forward.
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[0]?.method).toBe('PUT');
    expect(sent[0]?.url).toBe('/api/vtz/YouSource.Public');
    expect(sent[1]?.method).toBe('POST');
    expect(sent[1]?.url).toBe('/api/vtz/YouSource.Public/rescope');
    expect(sent[1]?.body).toEqual({ newName: 'YouSource.Corp.Finance.Public' });
  });

  it('commits only the settings when the parent is left alone', async () => {
    const sent = stubFetch({ detailBody: { zone: leafZone, ancestors: [] } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openPublicEditor();

    fireEvent.change(screen.getByLabelText('Telemetry mode'), { target: { value: 'sampled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Save changes to YouSource.Public?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    // No move means exactly one audited write; the Console never sends a no-op re-scope.
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.method).toBe('PUT');
  });

  it('says the settings committed when only the move was refused', async () => {
    // The edit succeeds and the re-scope is refused, so "nothing was committed" would be a lie.
    let call = 0;
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/vtz/tree')) return Promise.resolve(jsonResponse(200, tree));
      if (input.startsWith('/api/vtz/detail')) {
        return Promise.resolve(jsonResponse(200, { zone: leafZone, ancestors: [] }));
      }
      if (input.startsWith('/api/overview/sankey')) {
        return Promise.resolve(jsonResponse(200, sankey));
      }
      if (input.startsWith('/api/vtz/convergence')) {
        return Promise.resolve(jsonResponse(200, { hasBundle: false, version: 0, members: [] }));
      }
      call += 1;
      return Promise.resolve(
        call === 1
          ? jsonResponse(200, { id: 'YouSource.Public', lifecycle: 'draft' })
          : jsonResponse(409, {}),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openPublicEditor();
    fireEvent.change(screen.getByLabelText('Parent VTZ (optional)'), {
      target: { value: 'YouSource.Corp.Finance' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The settings were committed; the zone was NOT moved and stays where it was.',
    );
  });

  it('refuses to offer a move for a zone that still has sub-zones', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    // Finance carries three sub-zones, which the engine would orphan; the control says so and disables
    // rather than offering an act that can only end in a refusal.
    await openFinanceEditor();
    expect(screen.getByLabelText('Parent VTZ (optional)')).toBeDisabled();
    expect(screen.getByText(/has sub-zones, so the engine refuses to move it/)).toBeInTheDocument();
  });

  it('deletes behind a critical confirm through the delete verb', async () => {
    const sent = stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Delete zone' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete YouSource.Corp.Finance?');
    expect(dialog).toHaveTextContent('refuses to delete a zone that still has sub-zones');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.method).toBe('DELETE');
  });

  it('reports an engine refusal honestly and states that nothing was committed', async () => {
    // 403 with reason `denied` = a floor relaxation or an inheritance contradiction.
    stubFetch({ mutationStatus: 403, mutationBody: { error: 'refused', reason: 'denied' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('contradicts a rule the platform enforces');
    expect(alert).toHaveTextContent('Nothing was committed.');
  });

  it('reports a state conflict distinctly from a rule refusal', async () => {
    stubFetch({ mutationStatus: 409, mutationBody: { error: 'refused', reason: 'conflict' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Delete zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('still has sub-zones');
    expect(alert).toHaveTextContent('Nothing was committed.');
  });

  it('nests a new zone under the chosen parent, composing the dotted name', async () => {
    const sent = stubFetch({ mutationBody: { id: 'YouSource.Corp.New', lifecycle: 'draft' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New zone' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'New zone' }));
    await waitFor(() => {
      expect(screen.getByLabelText('VTZ name')).toBeInTheDocument();
    });

    // Parent VTZ is what nests: pick a parent, name the leaf, and the full dotted name is composed.
    fireEvent.change(screen.getByLabelText('Parent VTZ (optional)'), {
      target: { value: 'YouSource.Corp.Finance' },
    });
    fireEvent.change(screen.getByLabelText('VTZ name'), { target: { value: 'reps' } });
    expect(screen.getByText('YouSource.Corp.Finance.reps')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create zone' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Create YouSource.Corp.Finance.reps?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.method).toBe('POST');
    const spec = sent[0]?.body as { name: string; ownPostures: unknown[] };
    expect(spec.name).toBe('YouSource.Corp.Finance.reps');
    expect(spec.ownPostures).toEqual([]);
  });

  it('authors a stand-alone top-level zone when no parent is chosen', async () => {
    const sent = stubFetch({ mutationBody: { id: 'Demo', lifecycle: 'draft' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New zone' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'New zone' }));
    await waitFor(() => {
      expect(screen.getByLabelText('VTZ name')).toBeInTheDocument();
    });
    // No parent is the default: every zone can stand alone, none is a root by privilege.
    expect(screen.getByLabelText('Parent VTZ (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('VTZ name'), { target: { value: 'Demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect((sent[0]?.body as { name: string }).name).toBe('Demo');
  });

  it('says plainly that saving replaces the description the engine does not return', async () => {
    // NAMED GAP: `WireVtzTreeNode` carries no description, so the Console cannot show the stored value.
    // It must not silently overwrite it without telling the operator.
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await openFinanceEditor();
    expect(
      screen.getByText(/does not return the stored description, so saving replaces it/),
    ).toBeInTheDocument();
  });
});

describe('the empty-tenant bootstrap', () => {
  it('lets an empty tenant author its FIRST zone with no parent', async () => {
    // Regression: the create form used to require picking a parent, so a tenant with no zones could
    // never author one -- the surface dead-ended on its own empty state.
    const sent = stubFetch({ treeBody: { zones: [], truncated: false } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByText('No trust zones yet')).toBeInTheDocument();
    });
    expect(screen.getByText(/Use New zone to author the first one/)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'New zone' });
    expect(create).toBeEnabled();

    fireEvent.click(create);
    await waitFor(() => {
      expect(screen.getByLabelText('VTZ name')).toBeInTheDocument();
    });
    // Nothing to nest under, and nothing required to.
    expect(screen.getByLabelText('Parent VTZ (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('VTZ name'), { target: { value: 'Demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    const spec = sent[0]?.body as { name: string; ownPostures: unknown[] };
    expect(spec.name).toBe('Demo');
    // No policy authored: the engine fail-closes every domain it was not told about.
    expect(spec.ownPostures).toEqual([]);
  });
});

describe('P5.5 surface placement (the 2026-07-21 rule)', () => {
  it('offers NO policy-distribution control anywhere on the VTZ surface (structural)', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
      ).toBeInTheDocument();
    });
    // Policy is composed + pushed from the POLICY tab; the VTZ surface never offers it. (The zone
    // editor's own "Commit" is zone AUTHORING, not policy distribution, and is out of scope here.)
    expect(screen.queryByRole('button', { name: /distribute/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Policy distribution/i)).not.toBeInTheDocument();
  });
});
