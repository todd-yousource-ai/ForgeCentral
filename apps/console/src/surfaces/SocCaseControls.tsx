// apps/console/src/surfaces/SocCaseControls.tsx -- the case controls (IP-CONSOLE-03 S3.12).
//
// The analyst loop's SPA half over crdb IP-AISOC-STEP1 C.1 (assign / acknowledge / close) and SC.7
// (the disposition verdict), through the S3.11 routes. Every control is CONFIRM-GATED like Approve:
// each is an audited act under the operator's principal that the engine will not un-record.
//
// INV-SOC-CASE-ACT-HONEST:
//   * The body sent is exactly the field the act takes. The disposition form offers ONE field per
//     verdict -- the SC.7 field the engine's `parse_disposition` requires -- and nothing else, so a
//     verdict can never carry a stray justification the engine would silently drop.
//   * The outcome shown is what the engine RETURNED: `closedNow` decides whether the copy says the
//     incident closed, never the act's name. A disposition on an already-closed incident is a
//     correction, and the copy says so instead of claiming a second close.
//   * A refusal renders the engine's reason verbatim (409), or names the one indistinguishable
//     refusal (404). Nothing here is reported as done that the engine did not confirm.
//
// THE ASSIGNEE IS A PRINCIPAL ID, TYPED (operator ruling 2026-09-24, option 3). Assignees come from
// the RBAC groups on Settings -> RBAC, and RBAC lives in the BFF today, where group MEMBERS are not
// enumerable -- so a picker would have to be filled from somewhere the platform does not yet hold.
// A fabricated operator list is exactly the stub this surface exists to refuse; the field takes the
// id and the picker lands with the engine RBAC store (crdb C.9 / TRD-CONSOLE-11). The engine records
// the id the Console submits (crdb rider C.1r validates it engine-side once that store exists).

import { useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog } from '@forge/design';
import {
  DISPOSITIONS,
  REMEDIATION_ACTIONS,
  isPrincipalId,
  type CaseActDraft,
  type CaseActRecorded,
  type Disposition,
  type DispositionDraft,
  type DispositionRecorded,
  type RemediationAction,
} from '@forge/contracts';

import { CaseCommandError, useCaseAct, useDisposition } from './useCaseCommand.js';

/** The operator-facing name of each verdict (the wire tag is the engine's vocabulary, kept as-is). */
export function dispositionLabel(disposition: Disposition): string {
  switch (disposition) {
    case 'false_positive':
      return 'False positive';
    case 'benign_authorized':
      return 'Benign, authorized';
    case 'true_positive_remediated':
      return 'True positive, remediated';
    case 'true_positive_blocked':
      return 'True positive, blocked';
    case 'true_positive_risk_accepted':
      return 'True positive, risk accepted';
    case 'duplicate':
      return 'Duplicate';
    case 'undetermined':
      return 'Undetermined';
  }
}

/** The one field each verdict carries (SC.7), as the form labels it. `null` for `undetermined`. */
export function dispositionFieldLabel(disposition: Disposition): string | null {
  switch (disposition) {
    case 'false_positive':
      return 'Justification';
    case 'benign_authorized':
      return 'Authorized by';
    case 'true_positive_remediated':
      return 'Action taken';
    case 'true_positive_blocked':
      return 'Blocking control';
    case 'true_positive_risk_accepted':
      return 'Accepting party';
    case 'duplicate':
      return 'Predecessor incident id';
    case 'undetermined':
      return null;
  }
}

/** The raw form state: one text field, one action select, one expiry date, whichever the verdict uses. */
export interface DispositionFormState {
  readonly disposition: Disposition;
  readonly text: string;
  readonly action: RemediationAction;
  /** ISO calendar date (`YYYY-MM-DD`); the acceptance lapses at 00:00 UTC that day. */
  readonly expiryDate: string;
}

/** Convert an ISO calendar date to the unix instant at 00:00 UTC, or `null` when malformed. */
export function expiryDateToSeconds(expiryDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return null;
  }
  const millis = Date.parse(`${expiryDate}T00:00:00Z`);
  return Number.isNaN(millis) ? null : Math.floor(millis / 1000);
}

/**
 * Build the disposition draft from the form, or `null` while it cannot be submitted.
 *
 * Mirrors `toDispositionDraft` on the BFF: exactly the SC.7 field per verdict, trimmed and non-blank,
 * an expiry strictly in the future (`nowSeconds` is injected so the rule is testable). A `null` here
 * disables the control rather than costing a round trip the engine would refuse.
 */
export function buildDispositionDraft(
  form: DispositionFormState,
  nowSeconds: number,
): DispositionDraft | null {
  const text = form.text.trim();
  switch (form.disposition) {
    case 'false_positive':
      return text === '' ? null : { disposition: form.disposition, justification: text };
    case 'benign_authorized':
      return text === '' ? null : { disposition: form.disposition, authorizedBy: text };
    case 'true_positive_remediated':
      return { disposition: form.disposition, actionTaken: form.action };
    case 'true_positive_blocked':
      return text === '' ? null : { disposition: form.disposition, blockingControl: text };
    case 'true_positive_risk_accepted': {
      const expirySeconds = expiryDateToSeconds(form.expiryDate);
      if (text === '' || expirySeconds === null || expirySeconds <= nowSeconds) {
        return null;
      }
      return { disposition: form.disposition, acceptingParty: text, expirySeconds };
    }
    case 'duplicate':
      return text === '' ? null : { disposition: form.disposition, predecessor: text };
    case 'undetermined':
      return { disposition: form.disposition };
  }
}

/** The acts this block submits; a note is composed in the dock's Notes pane beside the notes it joins. */
type PanelAct = Exclude<CaseActDraft, { readonly act: 'noted' }>;

/** What is awaiting the operator's confirmation. */
type Pending =
  | { readonly kind: 'act'; readonly draft: PanelAct }
  | { readonly kind: 'disposition'; readonly draft: DispositionDraft };

/** The confirm dialog's copy: what the act does, and that it is audited and not undoable. */
function pendingCopy(pending: Pending): { readonly title: string; readonly description: string } {
  if (pending.kind === 'disposition') {
    return {
      title: `Record the verdict "${dispositionLabel(pending.draft.disposition)}"?`,
      description:
        pending.draft.disposition === 'false_positive'
          ? 'This closes the incident and DOWN-WEIGHTS every incident in this tenant with the same ATT&CK technique. It is audited under your principal; a later verdict replaces it, and the trail keeps both.'
          : 'This closes the incident and records the verdict (a true-positive verdict also teaches calibration). It is audited under your principal; a later verdict replaces it, and the trail keeps both.',
    };
  }
  switch (pending.draft.act) {
    case 'assigned':
      return {
        title: 'Assign this incident?',
        description: `The incident is handed to principal ${pending.draft.assignee}. The act is audited under your principal; the engine records the id as submitted.`,
      };
    case 'acked':
      return {
        title: 'Acknowledge this incident?',
        description:
          'Records that a human has seen it. Audited under your principal; it changes nothing else.',
      };
    case 'closed':
      return {
        title: 'Close without a verdict?',
        description:
          'The incident leaves both channels with NO verdict recorded, so calibration learns nothing from it. Prefer a disposition when you know what this was. Audited under your principal; a closed incident refuses assign, acknowledge and close, but still accepts notes.',
      };
  }
}

/** The outcome copy for a recorded case act -- from what the engine returned, never from the act's name. */
export function caseActOutcome(recorded: CaseActRecorded): string {
  switch (recorded.act) {
    case 'assigned':
      return 'Assigned and recorded in the trail.';
    case 'acked':
      return 'Acknowledged and recorded in the trail.';
    case 'noted':
      return recorded.noteRef === null
        ? 'The note was recorded.'
        : `The note was recorded as ${recorded.noteRef}.`;
    case 'closed':
      return recorded.closedNow
        ? 'Closed without a verdict. The incident left both channels; no calibration signal was recorded.'
        : 'The engine recorded the close but reports the incident was not closed by it.';
  }
}

/** The outcome copy for a recorded disposition: a correction on a closed incident says so. */
export function dispositionOutcome(recorded: DispositionRecorded): string {
  const verdict = dispositionLabel(recorded.disposition);
  return recorded.closedNow
    ? `Verdict recorded: ${verdict}. The incident is closed.`
    : `Verdict recorded: ${verdict}, as a correction. The incident was already closed, so this did not close it.`;
}

function refusalText(error: Error): string {
  return error instanceof CaseCommandError ? error.reason : 'The command did not reach the engine.';
}

export interface SocCaseControlsProps {
  readonly incidentId: string;
}

export function SocCaseControls({ incidentId }: SocCaseControlsProps): ReactElement {
  const act = useCaseAct();
  const disposition = useDisposition();
  const [pending, setPending] = useState<Pending | null>(null);
  const [assignee, setAssignee] = useState('');
  const [form, setForm] = useState<DispositionFormState>({
    disposition: 'undetermined',
    text: '',
    action: REMEDIATION_ACTIONS[0],
    expiryDate: '',
  });
  const busy = act.isPending || disposition.isPending;
  const assigneeValid = isPrincipalId(assignee);
  const dispositionDraft = buildDispositionDraft(form, Math.floor(Date.now() / 1000));
  const fieldLabel = dispositionFieldLabel(form.disposition);

  function confirm(): void {
    if (pending === null) {
      return;
    }
    setPending(null);
    if (pending.kind === 'act') {
      act.mutate(
        { incidentId, draft: pending.draft },
        pending.draft.act === 'assigned'
          ? {
              onSuccess: () => {
                setAssignee('');
              },
            }
          : undefined,
      );
    } else {
      disposition.mutate({ incidentId, draft: pending.draft });
    }
  }

  return (
    <section className="fcx-socc" aria-label="Case" data-testid="soc-case">
      <h5 className="fcx-socv__sub">Case</h5>

      <div className="fcx-socv__controls">
        <label className="fcx-socp__field fcx-socc__assignee">
          <span className="fcx-socp__label">Assign to (principal id)</span>
          <input
            type="text"
            className="fcx-socp__input"
            value={assignee}
            aria-label="Assignee principal id"
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            onChange={(event) => {
              setAssignee(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="fcx-socv__control"
          data-testid="soc-assign"
          // A malformed id is refused HERE (the BFF parser would 400 it) rather than sent.
          disabled={!assigneeValid || busy}
          onClick={() => {
            setPending({
              kind: 'act',
              draft: { act: 'assigned', assignee: assignee.trim().toLowerCase() },
            });
          }}
        >
          Assign
        </button>
        <button
          type="button"
          className="fcx-socv__control"
          data-testid="soc-ack"
          disabled={busy}
          onClick={() => {
            setPending({ kind: 'act', draft: { act: 'acked' } });
          }}
        >
          Acknowledge
        </button>
        <button
          type="button"
          className="fcx-socv__control"
          data-testid="soc-close"
          disabled={busy}
          onClick={() => {
            setPending({ kind: 'act', draft: { act: 'closed' } });
          }}
        >
          Close without verdict
        </button>
      </div>
      <p className="fcx-socv__controls-note" data-testid="soc-assignee-note">
        {assignee !== '' && !assigneeValid
          ? 'Not a principal id. The engine records principal ids only.'
          : 'Assignees are the principals in the RBAC groups on Settings, entered by id. A picker over the directory lands with the engine RBAC store; no operator list is invented here.'}
      </p>

      <form
        className="fcx-socc__verdict"
        aria-label="Record a disposition"
        data-testid="soc-disposition-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (dispositionDraft !== null) {
            setPending({ kind: 'disposition', draft: dispositionDraft });
          }
        }}
      >
        <label className="fcx-socp__field">
          <span className="fcx-socp__label">Verdict</span>
          <select
            className="fcx-socp__select"
            aria-label="Verdict"
            value={form.disposition}
            onChange={(event) => {
              // The verdict decides which field applies; the others are dropped, not carried.
              setForm({
                disposition: event.target.value as Disposition,
                text: '',
                action: REMEDIATION_ACTIONS[0],
                expiryDate: '',
              });
            }}
          >
            {DISPOSITIONS.map((verdict) => (
              <option key={verdict} value={verdict}>
                {dispositionLabel(verdict)}
              </option>
            ))}
          </select>
        </label>

        {form.disposition === 'true_positive_remediated' ? (
          <label className="fcx-socp__field">
            <span className="fcx-socp__label">{fieldLabel}</span>
            <select
              className="fcx-socp__select"
              aria-label="Action taken"
              value={form.action}
              onChange={(event) => {
                setForm({ ...form, action: event.target.value as RemediationAction });
              }}
            >
              {REMEDIATION_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
        ) : fieldLabel !== null ? (
          <label className="fcx-socp__field">
            <span className="fcx-socp__label">{fieldLabel}</span>
            <input
              type="text"
              className="fcx-socp__input"
              aria-label={fieldLabel}
              value={form.text}
              onChange={(event) => {
                setForm({ ...form, text: event.target.value });
              }}
            />
          </label>
        ) : null}

        {form.disposition === 'true_positive_risk_accepted' ? (
          <label className="fcx-socp__field">
            <span className="fcx-socp__label">Acceptance lapses on</span>
            <input
              type="date"
              className="fcx-socp__input"
              aria-label="Acceptance lapses on"
              value={form.expiryDate}
              onChange={(event) => {
                setForm({ ...form, expiryDate: event.target.value });
              }}
            />
          </label>
        ) : null}

        <button
          type="submit"
          className="fcx-socv__control"
          data-testid="soc-disposition"
          disabled={dispositionDraft === null || busy}
        >
          Record disposition
        </button>
        <span className="fcx-socv__controls-note">
          {form.disposition === 'undetermined'
            ? 'Closes the incident with no verdict label; unlike a plain close, the trail records that an operator ruled it undetermined.'
            : form.disposition === 'false_positive'
              ? "The one verdict that down-weights the tenant's incidents with the same technique. It needs your justification."
              : dispositionDraft === null
                ? form.disposition === 'true_positive_risk_accepted'
                  ? 'Needs the accepting party and a lapse date in the future; the engine refuses an expiry that has passed.'
                  : `Needs ${fieldLabel === null ? 'its field' : fieldLabel.toLowerCase()}.`
                : "Recorded as the incident's verdict; closes the incident."}
        </span>
      </form>

      {act.isError ? (
        <p className="fcx-socv__refusal" role="alert" data-testid="soc-case-refusal">
          The act was not recorded. {refusalText(act.error)}
        </p>
      ) : null}
      {disposition.isError ? (
        <p className="fcx-socv__refusal" role="alert" data-testid="soc-disposition-refusal">
          The verdict was not recorded. {refusalText(disposition.error)}
        </p>
      ) : null}
      {act.data ? (
        <p className="fcx-socv__outcome" data-testid="soc-case-outcome">
          <Badge variant="good">Recorded</Badge> {caseActOutcome(act.data)}
        </p>
      ) : null}
      {disposition.data ? (
        <p className="fcx-socv__outcome" data-testid="soc-disposition-outcome">
          <Badge variant="good">Recorded</Badge> {dispositionOutcome(disposition.data)}
        </p>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending === null ? '' : pendingCopy(pending).title}
        description={pending === null ? '' : pendingCopy(pending).description}
        confirmLabel="Record"
        tone="critical"
        onConfirm={confirm}
        onCancel={() => {
          setPending(null);
        }}
      />
    </section>
  );
}
