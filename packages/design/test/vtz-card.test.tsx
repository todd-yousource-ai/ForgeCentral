// packages/design/test/vtz-card.test.tsx -- the VTZ zone card (IP-CONSOLE-02 V2.4), tier 1.
//
// Proves the card's half of INV-CONSOLE-VTZ-REAL: it renders the real facts it is given, it shows NO trust
// gauge (the substrate carries no score), and every fact the engine cannot yet provide renders as an
// explicit "Not available" rather than a fabricated zero or a silently dropped row.
//
// Accessibility is asserted through role/name queries only (no axe-core: MPL-2.0, outside the dependency
// allowlist), matching the rest of the design-system suite.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VtzZoneCard } from '../src/components/VtzZoneCard.js';

const base = {
  name: 'YouSource.Corp.Finance',
  parent: 'YouSource.Corp',
  archetype: { label: 'Standard', variant: 'neutral' as const },
  risk: { label: 'Elevated', variant: 'caution' as const },
  riskLevel: 'yellow' as const,
  draft: false,
  subZoneCount: 3,
  memberCount: { unavailable: 'Zone membership is not stored by the engine yet.' },
  policyCount: { unavailable: 'Policies are not stored by the engine yet.' },
  onOpen: () => {},
};

describe('VtzZoneCard', () => {
  it('names the zone for assistive tech and stacks the leaf above its path', () => {
    render(<VtzZoneCard {...base} />);
    expect(
      screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('YouSource.Corp')).toBeInTheDocument();
  });

  it('shows the archetype + risk badges and the real sub-zone count', () => {
    render(<VtzZoneCard {...base} />);
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Elevated')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders NO trust score or gauge (the substrate carries none)', () => {
    const { container } = render(<VtzZoneCard {...base} />);
    expect(container.querySelector('.fc-score-ring')).toBeNull();
    expect(container.textContent).not.toMatch(/trust/i);
  });

  it('draws the zone glyph in the REAL risk color, reusing the Overview node class', () => {
    // The same disc the Overview graph draws, so the two surfaces read as one system -- and it carries a
    // real signal rather than the mockup's invented score.
    const { container } = render(<VtzZoneCard {...base} riskLevel="red" />);
    expect(container.querySelector('.fc-vtz-glyph.fc-ov__vtz--critical')).not.toBeNull();
  });

  it('draws the glyph neutral when no decision drives a band, never a reassuring green', () => {
    const { container } = render(<VtzZoneCard {...base} risk={null} riskLevel={null} />);
    expect(container.querySelector('.fc-ov__vtz--unknown')).not.toBeNull();
    expect(container.querySelector('.fc-ov__vtz--good')).toBeNull();
  });

  it('renders an unavailable count as an explicit absence, never a fabricated zero', () => {
    render(<VtzZoneCard {...base} />);
    // Both the member and policy counts are gated on engine work that does not exist yet.
    const absent = screen.getAllByText('Not available');
    expect(absent).toHaveLength(2);
    expect(absent[0]).toHaveAttribute('title', 'Zone membership is not stored by the engine yet.');
    // The labels still render, so the operator sees WHICH fact is missing rather than a shorter card.
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Policies')).toBeInTheDocument();
  });

  it('renders a real count when the engine can provide one', () => {
    render(<VtzZoneCard {...base} memberCount={{ value: 12 }} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('Not available')).toHaveLength(1);
  });

  it('omits the risk badge entirely when no decision drives a band', () => {
    render(<VtzZoneCard {...base} risk={null} />);
    expect(screen.queryByText('Elevated')).not.toBeInTheDocument();
    // Absent by design -- and specifically NOT defaulted to the reassuring green.
    expect(screen.queryByText('Nominal')).not.toBeInTheDocument();
  });

  it('marks a draft zone so it is never mistaken for one in force', () => {
    render(<VtzZoneCard {...base} draft />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('labels a root zone as such rather than inventing a parent', () => {
    render(<VtzZoneCard {...base} name="root" parent={null} />);
    expect(screen.getByText('Root zone')).toBeInTheDocument();
  });

  it('reports its selection state and opens on activation', () => {
    const onOpen = vi.fn();
    render(<VtzZoneCard {...base} selected onOpen={onOpen} />);
    const card = screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' });
    expect(card).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
