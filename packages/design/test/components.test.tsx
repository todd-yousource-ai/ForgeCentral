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
  Drawer,
  KpiCard,
  ScoreRing,
  TabStrip,
  scoreBand,
} from '../src/index.js';

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
