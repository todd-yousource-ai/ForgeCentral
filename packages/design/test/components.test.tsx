// packages/design/test/components.test.tsx -- F0.2b render + a11y tests for the component shells.
//
// Accessibility is verified through Testing Library's role/name queries and jest-dom matchers (name,
// role, value, keyboard) rather than an axe audit: axe-core is MPL-2.0, outside the dependency allowlist
// (DEPENDENCY-POLICY.md). Role-based assertions still enforce the ARIA contract of each shell.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Badge,
  ConfirmDialog,
  DataTable,
  Drawer,
  KpiCard,
  OverviewFlow,
  ScoreRing,
  TabStrip,
  scoreBand,
} from '../src/index.js';
import type { DataTableColumn } from '../src/index.js';
import type { OverviewGraph } from '@forge/contracts';

describe('Badge', () => {
  it('renders its label so meaning is never conveyed by color alone', () => {
    render(<Badge variant="critical">Deny</Badge>);
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('reflects the semantic variant as a token class (not a hex)', () => {
    render(<Badge variant="good">Permit</Badge>);
    expect(screen.getByText('Permit')).toHaveClass('fc-badge', 'fc-badge--good');
  });
});

describe('ScoreRing', () => {
  it('exposes the numeric score in its accessible name (not color alone)', () => {
    render(<ScoreRing score={82} label="AIAgents.Trusted" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('AIAgents.Trusted: trust score 82 of 100');
  });

  it('clamps and rounds the score', () => {
    render(<ScoreRing score={128.6} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('trust score 100 of 100');
  });

  it('bands scores by threshold (mockup: 82 good, 75 caution)', () => {
    expect(scoreBand(82)).toBe('good');
    expect(scoreBand(75)).toBe('caution');
    expect(scoreBand(40)).toBe('critical');
  });
});

describe('KpiCard', () => {
  it('renders the label, value, and optional badge', () => {
    render(<KpiCard label="Active VTZs" value="12" badge={{ text: 'Live', variant: 'good' }} />);
    expect(screen.getByRole('region', { name: 'Active VTZs' })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Live')).toHaveClass('fc-badge--good');
  });
});

describe('TabStrip', () => {
  const tabs = [
    { id: 'reflex', label: 'Trust Reflex' },
    { id: 'oversight', label: 'Operator Oversight' },
    { id: 'incidents', label: 'Incidents' },
  ];

  it('implements the ARIA tablist pattern with a roving tabindex', () => {
    render(
      <TabStrip tabs={tabs} activeId="oversight" onChange={vi.fn()} ariaLabel="AIOps sections" />,
    );
    expect(screen.getByRole('tablist', { name: 'AIOps sections' })).toBeInTheDocument();
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveAccessibleName('Operator Oversight');
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Trust Reflex' })).toHaveAttribute('tabindex', '-1');
  });

  it('changes the active tab on click', () => {
    const onChange = vi.fn();
    render(
      <TabStrip tabs={tabs} activeId="reflex" onChange={onChange} ariaLabel="AIOps sections" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Incidents' }));
    expect(onChange).toHaveBeenCalledWith('incidents');
  });

  it('moves selection with the Right arrow (WCAG 2.1.1), wrapping at the end', () => {
    const onChange = vi.fn();
    render(
      <TabStrip tabs={tabs} activeId="incidents" onChange={onChange} ariaLabel="AIOps sections" />,
    );
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('reflex');
  });
});

describe('Drawer', () => {
  it('renders nothing when closed (no hidden panel in the DOM)', () => {
    render(
      <Drawer open={false} title="Agent detail" onClose={vi.fn()}>
        <p>body</p>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('body')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its title, with its body content', () => {
    render(
      <Drawer open title="Agent detail" onClose={vi.fn()}>
        <p>host content</p>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Agent detail' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('host content')).toBeInTheDocument();
  });

  it('closes on Escape and on the close button (WCAG 2.1.2, no keyboard trap)', () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Agent detail" onClose={onClose}>
        <p>body</p>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ConfirmDialog', () => {
  it('is an alertdialog named + described, guarding a consequential act', () => {
    render(
      <ConfirmDialog
        open
        title="Quarantine agent?"
        description="Its egress is cut until released."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Quarantine agent?' });
    expect(dialog).toHaveAccessibleDescription('Its egress is cut until released.');
  });

  it('confirms and cancels through its buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Revoke grant?"
        confirmLabel="Revoke"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('maps Escape to cancel (the safe default)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Revoke grant?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('marks a destructive confirm with the critical token class (not color alone)', () => {
    render(
      <ConfirmDialog
        open
        title="Delete?"
        confirmLabel="Delete"
        tone="critical"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('fc-btn--critical');
  });
});

describe('DataTable', () => {
  interface Row {
    readonly id: string;
    readonly rule: string;
    readonly at: number;
  }
  const columns: DataTableColumn<Row>[] = [
    { id: 'rule', header: 'Rule', cell: (r) => r.rule },
    { id: 'at', header: 'Time', cell: (r) => String(r.at), align: 'end' },
  ];
  const rows: Row[] = [
    { id: 'a', rule: 'LR-EX-001', at: 200 },
    { id: 'b', rule: 'LR-NET-002', at: 100 },
  ];

  it('renders a semantic table with headers + a row per datum', () => {
    render(<DataTable caption="Decisions" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('table', { name: 'Decisions' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Rule' })).toBeInTheDocument();
    // One header row + two data rows.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('LR-NET-002')).toBeInTheDocument();
  });

  it('shows the honest empty node (not a fabricated row) when there are no rows', () => {
    render(
      <DataTable
        caption="Decisions"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="No decisions match the current filters."
      />,
    );
    expect(screen.getByText('No decisions match the current filters.')).toBeInTheDocument();
    // The empty row is a single presentational placeholder (header + 1 placeholder), never invented data.
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByText('LR-EX-001')).not.toBeInTheDocument();
  });

  it('makes rows interactive (click + keyboard) with an accessible label when onRowActivate is set', () => {
    const onActivate = vi.fn();
    render(
      <DataTable
        caption="Decisions"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowActivate={onActivate}
        rowLabel={(r) => `Open ${r.rule}`}
      />,
    );
    const row = screen.getByRole('row', { name: 'Open LR-EX-001' });
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.click(row);
    expect(onActivate).toHaveBeenCalledWith(rows[0]);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('a non-interactive row has no tabindex (rows are inert without onRowActivate)', () => {
    render(<DataTable caption="Decisions" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('LR-EX-001').closest('tr')).not.toHaveAttribute('tabindex');
  });
});

describe('OverviewFlow', () => {
  const graph: OverviewGraph = {
    sources: [
      { class: 'users', count: 12 },
      { class: 'agents', count: 3 },
    ],
    destinations: [
      { class: 'saas', count: 4 },
      { class: 'private-apps', count: 2 },
    ],
    edges: [
      { sourceClass: 'users', destClass: 'saas', weight: 5 },
      { sourceClass: 'agents', destClass: 'private-apps', weight: 1 },
    ],
    risk: { level: 'red', escalate: 3, candidate: 2, observe: 7 },
  };

  it('enumerates the sources, destinations, and risk in the accessible name (never color alone)', () => {
    render(<OverviewFlow graph={graph} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Connectivity flow. Sources: Users 12, AI Agents 3. ' +
        'Public zone risk: Critical (3 escalate, 2 candidate). ' +
        'Destinations: SaaS Apps 4, Private Apps 2.',
    );
  });

  it('renders a visible label + count for every class node (known + title-cased unknown)', () => {
    render(<OverviewFlow graph={graph} />);
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('AI Agents')).toBeInTheDocument();
    expect(screen.getByText('SaaS Apps')).toBeInTheDocument();
    // `private-apps` has no mapping in the mock's known set here -> title-cased honestly.
    expect(screen.getByText('Private Apps')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('colors the Public zone by the risk band as a token class (not a hex) + labels it', () => {
    const { container } = render(<OverviewFlow graph={graph} />);
    expect(container.querySelector('.fc-overview-flow__zone--critical')).not.toBeNull();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('draws each ribbon colored by its SOURCE class (weighted, semantic class)', () => {
    const { container } = render(<OverviewFlow graph={graph} />);
    expect(container.querySelector('.fc-overview-flow__edge--users')).not.toBeNull();
    expect(container.querySelector('.fc-overview-flow__edge--agents')).not.toBeNull();
    // The heaviest edge is thicker than the lightest (weight -> stroke width).
    const users = container.querySelector('.fc-overview-flow__edge--users');
    const agents = container.querySelector('.fc-overview-flow__edge--agents');
    const widthOf = (el: Element | null): number => Number(el?.getAttribute('stroke-width') ?? '0');
    expect(widthOf(users)).toBeGreaterThan(widthOf(agents));
  });

  it('falls back to a muted lane for an unknown source class (no crash, honest label)', () => {
    const odd: OverviewGraph = {
      sources: [{ class: 'satellites', count: 1 }],
      destinations: [{ class: 'network', count: 1 }],
      edges: [{ sourceClass: 'satellites', destClass: 'network', weight: 1 }],
      risk: { level: 'yellow', escalate: 0, candidate: 1, observe: 0 },
    };
    const { container } = render(<OverviewFlow graph={odd} />);
    expect(screen.getByText('Satellites')).toBeInTheDocument();
    expect(container.querySelector('.fc-overview-flow__edge--muted')).not.toBeNull();
    expect(container.querySelector('.fc-overview-flow__node--muted')).not.toBeNull();
  });

  it('renders the honest empty state for a tenant with no observed connectivity', () => {
    const empty: OverviewGraph = {
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
    };
    const { container } = render(<OverviewFlow graph={empty} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Connectivity flow: no connectivity observed. Public zone risk: Nominal.',
    );
    expect(screen.getByText('No connectivity observed')).toBeInTheDocument();
    // The zone still shows its (green) risk; no source/destination node is fabricated.
    expect(container.querySelector('.fc-overview-flow__zone--good')).not.toBeNull();
    expect(container.querySelector('.fc-overview-flow__node')).toBeNull();
  });

  it('renders a busy skeleton while loading (graph null or loading flag), no fabricated flow', () => {
    const { rerender, container } = render(<OverviewFlow graph={null} />);
    const region = screen.getByRole('img');
    expect(region).toHaveAccessibleName('Loading connectivity flow');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.fc-overview-flow__node')).toBeNull();
    // The loading flag forces the skeleton even when a graph is present.
    rerender(<OverviewFlow graph={graph} loading />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-busy', 'true');
  });
});
