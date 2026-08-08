// apps/console/src/test/soc-queue.test.tsx -- IP-CONSOLE-03 S3.4 tests for the decision queue.
//
// The two properties that make this a decision surface rather than a list:
//   * The ENGINE's order is what renders. The queue and the `Decision Waiting` tile read the same
//     authority field, so a client-side sort would let them disagree about what is blocking a person.
//   * A refused read is an ERROR, never an empty queue -- "no open incidents" for a SOC that has more
//     than it can show is the one direction this must not fail in.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SocIncidentRow } from '@forge/contracts';

import {
  SocDecisionQueue,
  authorityVariant,
  channelOf,
  shortIdentifier,
} from '../surfaces/SocDecisionQueue.js';
import { renderWithProviders } from './render.js';

const NOW = 1_700_003_600;

function row(overrides: Partial<SocIncidentRow> = {}): SocIncidentRow {
  return {
    incidentId: 'ep-soc-1',
    ruleId: 'LR-C2-001',
    anchor: 'T1071',
    subject: 'codex-helper',
    finding: 'Repeated outbound contact to a rare destination',
    authority: 'review_required',
    posture: 'candidate',
    confidence: 'HIGH',
    openedAt: NOW - 7200,
    lastSeen: NOW - 600,
    evidenceCount: 2,
    ...overrides,
  };
}

function mockQueue(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 503,
        json: () => Promise.resolve(body),
      } as Response),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the SOC decision queue (S3.4)', () => {
  it('renders the engine order exactly, without re-sorting', async () => {
    // The engine ranks what blocks a human above what is merely severe. The returned order here has
    // the contained-but-higher-posture incident SECOND; a surface that sorted by posture, recency or
    // id would move it, and this asserts none of those happens.
    mockQueue([
      row({ incidentId: 'ep-waiting', authority: 'approval_required', posture: 'candidate' }),
      row({
        incidentId: 'ep-contained',
        authority: 'contained',
        posture: 'escalate',
        lastSeen: NOW - 10,
      }),
      row({ incidentId: 'ep-quiet', authority: 'automatic', posture: 'observe-only' }),
    ]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    const list = await screen.findByTestId('soc-decision-queue');
    const ids = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(ids[0]).toContain('ep-waiting');
    expect(ids[1]).toContain('ep-contained');
    expect(ids[2]).toContain('ep-quiet');
  });

  it('leads each card with what the incident needs from a human, and carries no score', async () => {
    mockQueue([row()]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    const list = await screen.findByTestId('soc-decision-queue');
    const card = within(list).getByRole('button');
    expect(card).toHaveTextContent('Review required');
    expect(card).toHaveTextContent('Repeated outbound contact to a rare destination');
    expect(card).toHaveTextContent('codex-helper');
    expect(card).toHaveTextContent('T1071');
    expect(card).toHaveTextContent('High confidence');
    expect(card).toHaveTextContent('2 legs');
    // The prototype's 94.1 has no engine source. Nothing on the card may look like one.
    expect(card.textContent).not.toMatch(/\d+\.\d/);
  });

  it('reports selection and marks the selected card', async () => {
    mockQueue([row(), row({ incidentId: 'ep-soc-2' })]);
    const picked: string[] = [];

    const { rerender } = renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={(id) => picked.push(id)} nowSeconds={NOW} />,
    );

    const list = await screen.findByTestId('soc-decision-queue');
    const cards = within(list).getAllByRole('button');
    fireEvent.click(cards[1] as HTMLElement);
    expect(picked).toEqual(['ep-soc-2']);

    rerender(
      <SocDecisionQueue selected="ep-soc-2" onSelect={(id) => picked.push(id)} nowSeconds={NOW} />,
    );
    const selected = within(screen.getByTestId('soc-decision-queue')).getAllByRole(
      'button',
    )[1] as HTMLElement;
    expect(selected).toHaveAttribute('aria-current', 'true');
  });

  it('renders an honest empty state for a quiet SOC', async () => {
    mockQueue([]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No open incidents')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('soc-decision-queue')).not.toBeInTheDocument();
  });

  it('shows an error, never an empty queue, when the read fails', async () => {
    // A 503 here means the engine REFUSED the queue (over its ceiling) or a row would not narrow.
    // Rendering "No open incidents" for either would be the surface lying by omission.
    mockQueue({ error: 'unavailable' }, false);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    await waitFor(
      () => {
        expect(screen.getByText(/cannot be shown/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByText('No open incidents')).not.toBeInTheDocument();
  });

  it('colors the authority chip by what it costs to leave the incident alone', () => {
    // The two that block a person are the loud ones; contained is calm because it is handled, and
    // automatic asks nothing of anyone.
    expect(authorityVariant('approval_required')).toBe('critical');
    expect(authorityVariant('review_required')).toBe('caution');
    expect(authorityVariant('contained')).toBe('good');
    expect(authorityVariant('automatic')).toBe('neutral');
  });

  it('renders ages relative to now so a stale tab cannot read as fresh', async () => {
    mockQueue([
      row({ incidentId: 'ep-recent', lastSeen: NOW - 120 }),
      row({ incidentId: 'ep-old', lastSeen: NOW - 90_000 }),
    ]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    const list = await screen.findByTestId('soc-decision-queue');
    const cards = within(list).getAllByRole('button');
    expect(cards[0]).toHaveTextContent('2m ago');
    expect(cards[1]).toHaveTextContent('1d ago');
  });

  // -- the ruled credibility channels (crdb IP-SOC-CREDIBILITY-CHANNELS, S3.9) ---------------------

  it('files escalate under Urgent Review and candidate under Threat Inspection', () => {
    expect(channelOf('escalate')).toBe('urgent');
    expect(channelOf('candidate')).toBe('inspection');
    // ObserveOnly is ephemeral by the ingress contract; it belongs to neither channel.
    expect(channelOf('observe-only')).toBeNull();
  });

  it('narrows to a channel without re-sorting, and counts from the same payload', async () => {
    mockQueue([
      row({ incidentId: 'ep-cand-1', posture: 'candidate' }),
      row({ incidentId: 'ep-esc-1', posture: 'escalate' }),
      row({ incidentId: 'ep-cand-2', posture: 'candidate' }),
      row({ incidentId: 'ep-esc-2', posture: 'escalate' }),
    ]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    // The strip counts what is in hand: 4 total, 2 urgent, 2 inspection.
    const strip = await screen.findByRole('group', { name: 'Credibility channels' });
    expect(within(strip).getByRole('button', { name: 'All (4)' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Urgent Review (2)' })).toBeInTheDocument();
    expect(
      within(strip).getByRole('button', { name: 'Threat Inspection (2)' }),
    ).toBeInTheDocument();

    // Narrowing to Urgent Review keeps the ENGINE's relative order of the escalate rows.
    fireEvent.click(within(strip).getByRole('button', { name: 'Urgent Review (2)' }));
    const list = screen.getByTestId('soc-decision-queue');
    const ids = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(ids).toHaveLength(2);
    expect(ids[0]).toContain('ep-esc-1');
    expect(ids[1]).toContain('ep-esc-2');
  });

  it('names the channel when the filter empties the view, never a quiet SOC', async () => {
    // One candidate incident, none escalated: Urgent Review is empty BY THE FILTER, and the state
    // must say which channel is empty and how much sits outside it.
    mockQueue([row({ incidentId: 'ep-cand-only', posture: 'candidate' })]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    const strip = await screen.findByRole('group', { name: 'Credibility channels' });
    fireEvent.click(within(strip).getByRole('button', { name: 'Urgent Review (0)' }));

    expect(screen.getByText('No incidents in Urgent Review')).toBeInTheDocument();
    expect(screen.getByText(/1 open incident\(s\) sit outside this channel/)).toBeInTheDocument();
    // The whole-queue empty state must NOT render: the SOC is not quiet, the view is narrowed.
    expect(screen.queryByText('No open incidents')).not.toBeInTheDocument();
  });

  // -- identifier legibility -----------------------------------------------------------------------

  it('shortens content-addressed identifiers for display and keeps the full value on the title', async () => {
    const subjectHash =
      '082f4dfb81b942712f6c9e73de99f7c0ced91f4b2c409c77070716915b11e79d414262dbd4f4b3a20ab6c9d5666576fa5a56d9a12eff1da467d28e442161bdd6';
    const incidentHash = `sha512:${'ab12cd34'.repeat(16)}`;
    mockQueue([row({ incidentId: incidentHash, subject: subjectHash })]);

    renderWithProviders(
      <SocDecisionQueue selected={null} onSelect={() => undefined} nowSeconds={NOW} />,
    );

    const list = await screen.findByTestId('soc-decision-queue');
    const card = within(list).getByRole('button');
    // The visible text is the short prefix; the untruncated digest does NOT render as text.
    expect(card).toHaveTextContent('082f4dfb81…');
    expect(card).toHaveTextContent('ab12cd34ab…');
    expect(card.textContent).not.toContain(subjectHash);
    // The full value survives on the title, so hover and assistive tech still get the identifier.
    expect(within(list).getByTitle(subjectHash)).toBeInTheDocument();
    expect(within(list).getByTitle(incidentHash)).toBeInTheDocument();
  });

  it('renders a human-named subject unchanged', () => {
    // Shortening is for digests only: a process name must never be truncated into ambiguity.
    expect(shortIdentifier('codex-helper')).toBe('codex-helper');
    expect(shortIdentifier('svc-account@corp')).toBe('svc-account@corp');
    // A short hex string (a rule tag, a port) is left alone too -- only long digests shorten.
    expect(shortIdentifier('abcd1234')).toBe('abcd1234');
  });
});
