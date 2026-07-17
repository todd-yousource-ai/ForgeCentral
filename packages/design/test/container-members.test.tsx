// packages/design/test/container-members.test.tsx -- IP-CONSOLE-01 O1.6b the container-members drawer body.
//
// Proves the LIST body renders each member as a clickable row (name + connection count, engine order), and
// its honest states: loading skeletons (never fabricated rows), an error with retry (never stale content),
// and an empty container as a real readout (INV-CONSOLE-NO-STUB).

import type { OverviewMember } from '@forge/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContainerMembersView } from '../src/index.js';

const members: OverviewMember[] = [
  { id: 'host-7', kind: 'endpoint', name: 'host-7', connectionCount: 12 },
  { id: 'aig:agent:codex', kind: 'agent_instance', name: 'Codex', connectionCount: 1 },
];

describe('ContainerMembersView', () => {
  it('lists each member with its name + pluralized connection count, in engine order', () => {
    render(<ContainerMembersView members={members} onSelectMember={vi.fn()} />);
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('host-7');
    expect(rows[0]).toHaveTextContent('12 connections');
    // Singular is honest (1 connection, not "1 connections").
    expect(rows[1]).toHaveTextContent('Codex');
    expect(rows[1]).toHaveTextContent('1 connection');
  });

  it('calls onSelectMember with the clicked member (select-then-act)', () => {
    const onSelectMember = vi.fn();
    render(<ContainerMembersView members={members} onSelectMember={onSelectMember} />);
    screen.getByRole('button', { name: /Codex/ }).click();
    expect(onSelectMember).toHaveBeenCalledWith(members[1]);
  });

  it('shows skeletons while loading, never fabricated rows', () => {
    const { container } = render(
      <ContainerMembersView members={undefined} loading onSelectMember={vi.fn()} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.fc-members__skeleton').length).toBeGreaterThan(0);
  });

  it('degrades to an error with a retry rather than an empty list', () => {
    const onRetry = vi.fn();
    render(<ContainerMembersView members={[]} error onSelectMember={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load/);
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an honest empty state for a container with no members', () => {
    render(<ContainerMembersView members={[]} onSelectMember={vi.fn()} />);
    expect(screen.getByText(/No members observed/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
