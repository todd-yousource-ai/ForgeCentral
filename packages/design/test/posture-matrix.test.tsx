// packages/design/test/posture-matrix.test.tsx -- the per-domain posture editor (V2.5), tier 1.
//
// Proves the editor's half of the authoring contract: the engine-flagged catastrophic floor is not
// editable (no control at all, and a stated reason), a non-floored domain is, the effective column shows
// the composed result and says when an ancestor tightened it, and a busy form cannot be double-submitted.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PostureMatrixEditor, postureText } from '../src/components/PostureMatrixEditor.js';
import type { PostureRow } from '../src/components/PostureMatrixEditor.js';

const rows: PostureRow[] = [
  { domain: 'governed-egress', own: 'deny', effective: 'deny', floor: true },
  { domain: 'execution', own: 'deny', effective: 'deny', floor: true },
  // The operator set this laxer than an ancestor did, so the effective value is tightened.
  { domain: 'ordinary-network', own: 'permit-deny-risky', effective: 'deny', floor: false },
  { domain: 'ipc', own: 'permit-deny-risky', effective: 'permit-deny-risky', floor: false },
];

describe('PostureMatrixEditor', () => {
  it('renders a floored row as locked with a stated reason, and offers NO control for it', () => {
    render(<PostureMatrixEditor rows={rows} onChange={() => {}} caption="Postures" />);
    expect(screen.getAllByText('Locked: catastrophic floor')).toHaveLength(2);
    // Not a disabled control -- no control at all: the engine refuses any spec that relaxes a floor, so
    // offering the affordance would be offering an action that cannot succeed.
    expect(screen.queryByLabelText('Posture for governed-egress')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Posture for execution')).not.toBeInTheDocument();
  });

  it('lets a non-floored domain be edited and reports the change by domain', () => {
    const onChange = vi.fn();
    render(<PostureMatrixEditor rows={rows} onChange={onChange} caption="Postures" />);
    const control = screen.getByLabelText('Posture for ipc');
    fireEvent.change(control, { target: { value: 'deny' } });
    expect(onChange).toHaveBeenCalledWith('ipc', 'deny');
  });

  it('shows the composed effective posture and marks what an ancestor tightened', () => {
    render(<PostureMatrixEditor rows={rows} onChange={() => {}} caption="Postures" />);
    // ordinary-network: the zone set permit-deny-risky but an ancestor denies, so effective is deny.
    expect(screen.getByText('Tightened by an ancestor')).toBeInTheDocument();
    // A row nothing tightened carries no such marker (only one row differs).
    expect(screen.getAllByText('Tightened by an ancestor')).toHaveLength(1);
  });

  it('disables every control while a commit is in flight (no double submit)', () => {
    render(<PostureMatrixEditor rows={rows} onChange={() => {}} disabled caption="Postures" />);
    expect(screen.getByLabelText('Posture for ipc')).toBeDisabled();
    expect(screen.getByLabelText('Posture for ordinary-network')).toBeDisabled();
  });

  it('labels both posture values in words, never by color alone', () => {
    expect(postureText('deny')).toBe('Deny');
    expect(postureText('permit-deny-risky')).toBe('Permit, deny risky');
  });
});
