// apps/console/src/test/soc-case.test.tsx -- IP-CONSOLE-03 S3.12 tests for the case controls.
//
// INV-SOC-CASE-ACT-HONEST, from the SPA side:
//   * Every control is confirm-gated; nothing is sent until the operator confirms.
//   * The body is exactly the field the act takes (the BFF parser's shape), and the disposition form
//     carries ONE field per verdict.
//   * The outcome shown is what the engine returned: `closedNow` decides the copy, never the act.
//   * A refusal renders the engine's reason verbatim (409) or the one indistinguishable refusal
//     (404); a malformed assignee is refused before a round trip.
//   * A recorded act drops the trail / notes / detail / queue reads (re-read, never appended).

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { CaseActRecorded, DispositionRecorded } from '@forge/contracts';

import {
  buildDispositionDraft,
  caseActOutcome,
  dispositionOutcome,
  expiryDateToSeconds,
  SocCaseControls,
} from '../surfaces/SocCaseControls.js';
import { caseRefusalReason } from '../surfaces/useCaseCommand.js';
import { renderWithProviders } from './render.js';

const PRINCIPAL = 'b4464672-f4cc-577f-ae05-f3ece3c67b64';

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/** A fetch stub answering the two command routes; returns the spy so bodies can be asserted. */
function mockCommands(reply: Reply): ReturnType<typeof vi.fn> {
  const spy = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    } as Response),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function lastBody(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}

function confirm(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the case controls (S3.12): the acts', () => {
  it('refuses a malformed assignee before any round trip', () => {
    const spy = mockCommands({ status: 200, body: {} });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.change(screen.getByLabelText('Assignee principal id'), {
      target: { value: 'alice' },
    });
    expect(screen.getByTestId('soc-assign')).toBeDisabled();
    expect(screen.getByTestId('soc-assignee-note')).toHaveTextContent(/Not a principal id/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never invents an operator list: the assignee is typed, and the note says why', () => {
    mockCommands({ status: 200, body: {} });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    expect(screen.queryByRole('combobox', { name: /assignee/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('soc-assignee-note')).toHaveTextContent(/engine RBAC store/);
  });

  it('sends exactly {incident, act, assignee} behind a confirm gate, and clears the field', async () => {
    const recorded: CaseActRecorded = {
      kind: 'recorded',
      act: 'assigned',
      closedNow: false,
      noteRef: null,
    };
    const spy = mockCommands({ status: 200, body: recorded });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.change(screen.getByLabelText('Assignee principal id'), {
      target: { value: PRINCIPAL.toUpperCase() },
    });
    fireEvent.click(screen.getByTestId('soc-assign'));
    // Gated: nothing sent until confirmed.
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Assign this incident/);

    confirm();
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(String(spy.mock.calls[0]?.[0])).toBe('/api/soc/act');
    expect(lastBody(spy)).toEqual({ incident: 'ep-1', act: 'assigned', assignee: PRINCIPAL });
    expect(await screen.findByTestId('soc-case-outcome')).toHaveTextContent(
      /Assigned and recorded/,
    );
    expect(screen.getByLabelText('Assignee principal id')).toHaveValue('');
  });

  it('sends a bare acknowledge with no stray field', async () => {
    const recorded: CaseActRecorded = {
      kind: 'recorded',
      act: 'acked',
      closedNow: false,
      noteRef: null,
    };
    const spy = mockCommands({ status: 200, body: recorded });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-ack'));
    confirm();
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(lastBody(spy)).toEqual({ incident: 'ep-1', act: 'acked' });
    expect(await screen.findByTestId('soc-case-outcome')).toHaveTextContent(/Acknowledged/);
  });

  it('reports a close as closed ONLY when the engine says closedNow', async () => {
    const recorded: CaseActRecorded = {
      kind: 'recorded',
      act: 'closed',
      closedNow: true,
      noteRef: null,
    };
    mockCommands({ status: 200, body: recorded });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-close'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/NO verdict recorded/);
    confirm();
    expect(await screen.findByTestId('soc-case-outcome')).toHaveTextContent(
      /Closed without a verdict/,
    );
  });

  it('renders the engine reason verbatim on a 409, never a silent no-op', async () => {
    mockCommands({
      status: 409,
      body: { error: 'refused', explanation: 'incident already closed' },
    });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-ack'));
    confirm();
    const refusal = await screen.findByTestId('soc-case-refusal');
    expect(refusal).toHaveTextContent('incident already closed');
    expect(screen.queryByTestId('soc-case-outcome')).not.toBeInTheDocument();
  });

  it('names the one indistinguishable refusal on a 404', async () => {
    mockCommands({ status: 404, body: { error: 'not_found' } });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-close'));
    confirm();
    expect(await screen.findByTestId('soc-case-refusal')).toHaveTextContent(/above this session/);
  });

  it('cancelling the gate sends nothing', () => {
    const spy = mockCommands({ status: 200, body: {} });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-ack'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('the case controls (S3.12): the disposition', () => {
  it('offers exactly the seven verdicts and one field per verdict', () => {
    mockCommands({ status: 200, body: {} });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    const verdict = screen.getByLabelText('Verdict');
    expect(verdict.querySelectorAll('option')).toHaveLength(7);

    // undetermined: no field, submittable as-is.
    expect(screen.queryByLabelText('Justification')).not.toBeInTheDocument();
    expect(screen.getByTestId('soc-disposition')).toBeEnabled();

    fireEvent.change(verdict, { target: { value: 'false_positive' } });
    expect(screen.getByLabelText('Justification')).toBeInTheDocument();
    expect(screen.queryByLabelText('Authorized by')).not.toBeInTheDocument();
    expect(screen.getByTestId('soc-disposition')).toBeDisabled();

    fireEvent.change(verdict, { target: { value: 'true_positive_remediated' } });
    expect(screen.getByLabelText('Action taken').querySelectorAll('option')).toHaveLength(5);
    expect(screen.queryByLabelText('Justification')).not.toBeInTheDocument();
  });

  it('sends the verdict with its ONE field, behind a confirm gate that names the down-weight', async () => {
    const recorded: DispositionRecorded = {
      kind: 'recorded',
      disposition: 'false_positive',
      closedNow: true,
    };
    const spy = mockCommands({ status: 200, body: recorded });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'false_positive' } });
    fireEvent.change(screen.getByLabelText('Justification'), {
      target: { value: '  scheduled backup job  ' },
    });
    fireEvent.click(screen.getByTestId('soc-disposition'));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /DOWN-WEIGHTS every incident in this tenant with the same ATT&CK technique/,
    );

    confirm();
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(String(spy.mock.calls[0]?.[0])).toBe('/api/soc/disposition');
    expect(lastBody(spy)).toEqual({
      incident: 'ep-1',
      disposition: 'false_positive',
      justification: 'scheduled backup job',
    });
    expect(await screen.findByTestId('soc-disposition-outcome')).toHaveTextContent(
      /False positive. The incident is closed/,
    );
  });

  it('reports a re-disposition of a closed incident as a correction, not a second close', async () => {
    const recorded: DispositionRecorded = {
      kind: 'recorded',
      disposition: 'undetermined',
      closedNow: false,
    };
    mockCommands({ status: 200, body: recorded });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.click(screen.getByTestId('soc-disposition'));
    confirm();
    expect(await screen.findByTestId('soc-disposition-outcome')).toHaveTextContent(
      /as a correction. The incident was already closed/,
    );
  });

  it('surfaces the engine reason when a verdict is refused', async () => {
    mockCommands({
      status: 409,
      body: { error: 'refused', explanation: 'duplicate predecessor does not resolve' },
    });
    renderWithProviders(<SocCaseControls incidentId="ep-1" />);

    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'duplicate' } });
    fireEvent.change(screen.getByLabelText('Predecessor incident id'), {
      target: { value: 'ep-0' },
    });
    fireEvent.click(screen.getByTestId('soc-disposition'));
    confirm();
    expect(await screen.findByTestId('soc-disposition-refusal')).toHaveTextContent(
      'duplicate predecessor does not resolve',
    );
  });
});

describe('the disposition draft builder (pure)', () => {
  const NOW = 1_800_000_000;
  const base = { text: '', action: 'reimage' as const, expiryDate: '' };

  it('mirrors the BFF parser: one field per verdict, blank refused', () => {
    expect(buildDispositionDraft({ ...base, disposition: 'undetermined' }, NOW)).toEqual({
      disposition: 'undetermined',
    });
    expect(buildDispositionDraft({ ...base, disposition: 'false_positive' }, NOW)).toBeNull();
    expect(
      buildDispositionDraft({ ...base, disposition: 'benign_authorized', text: ' ciso ' }, NOW),
    ).toEqual({ disposition: 'benign_authorized', authorizedBy: 'ciso' });
    expect(
      buildDispositionDraft(
        { ...base, disposition: 'true_positive_remediated', action: 'isolate' },
        NOW,
      ),
    ).toEqual({ disposition: 'true_positive_remediated', actionTaken: 'isolate' });
    expect(
      buildDispositionDraft(
        { ...base, disposition: 'true_positive_blocked', text: 'egress ACL' },
        NOW,
      ),
    ).toEqual({ disposition: 'true_positive_blocked', blockingControl: 'egress ACL' });
    expect(buildDispositionDraft({ ...base, disposition: 'duplicate', text: 'ep-0' }, NOW)).toEqual(
      {
        disposition: 'duplicate',
        predecessor: 'ep-0',
      },
    );
  });

  it('refuses a risk acceptance whose expiry is not strictly in the future', () => {
    // 2027-01-01T00:00:00Z = 1_798_761_600, before NOW; 2027-03-01 is after.
    expect(
      buildDispositionDraft(
        {
          ...base,
          disposition: 'true_positive_risk_accepted',
          text: 'ciso',
          expiryDate: '2027-01-01',
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      buildDispositionDraft(
        {
          ...base,
          disposition: 'true_positive_risk_accepted',
          text: 'ciso',
          expiryDate: '2027-03-01',
        },
        NOW,
      ),
    ).toEqual({
      disposition: 'true_positive_risk_accepted',
      acceptingParty: 'ciso',
      expirySeconds: 1_803_859_200,
    });
    expect(
      buildDispositionDraft(
        { ...base, disposition: 'true_positive_risk_accepted', text: '', expiryDate: '2027-03-01' },
        NOW,
      ),
    ).toBeNull();
  });

  it('converts a calendar date to the 00:00 UTC instant and refuses a malformed one', () => {
    expect(expiryDateToSeconds('2027-03-01')).toBe(1_803_859_200);
    expect(expiryDateToSeconds('03/01/2027')).toBeNull();
    expect(expiryDateToSeconds('2027-13-40')).toBeNull();
  });
});

describe('the outcome and refusal copy (pure)', () => {
  it('derives the close copy from closedNow, never from the act name', () => {
    expect(
      caseActOutcome({ kind: 'recorded', act: 'closed', closedNow: true, noteRef: null }),
    ).toMatch(/Closed without a verdict/);
    expect(
      caseActOutcome({ kind: 'recorded', act: 'closed', closedNow: false, noteRef: null }),
    ).toMatch(/was not closed by it/);
    expect(
      caseActOutcome({ kind: 'recorded', act: 'noted', closedNow: false, noteRef: 'n-1' }),
    ).toMatch(/recorded as n-1/);
  });

  it('distinguishes a closing verdict from a correction', () => {
    expect(
      dispositionOutcome({ kind: 'recorded', disposition: 'duplicate', closedNow: true }),
    ).toMatch(/Duplicate. The incident is closed/);
    expect(
      dispositionOutcome({ kind: 'recorded', disposition: 'duplicate', closedNow: false }),
    ).toMatch(/correction/);
  });

  it('carries the engine reason on 409 and admits a missing one', () => {
    expect(caseRefusalReason(409, 'incident already closed')).toBe(
      'The engine refused it: incident already closed',
    );
    expect(caseRefusalReason(409, null)).toMatch(/recorded no reason/);
    expect(caseRefusalReason(404, null)).toMatch(/clearance/);
    expect(caseRefusalReason(403, null)).toMatch(/not permitted/);
  });
});
