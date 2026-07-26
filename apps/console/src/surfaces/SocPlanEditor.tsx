// apps/console/src/surfaces/SocPlanEditor.tsx -- editing a proposed response (IP-CONSOLE-03 S3.8b).
//
// The `Modify Plan` half of the SOC commands. S3.8 built its whole path -- encode arm, route,
// resolver, fail-closed parser -- and left the control disabled because crdb had no plan PROPOSER,
// so there was nothing to edit. crdb SS.6 landed that proposer, so this is the deferral resolving.
//
// WHAT AN OPERATOR MAY CHANGE, AND WHAT THEY MAY NOT:
//   * They edit a step's TITLE and its ACTION. That is the whole submitted shape
//     (`toResponseStepDrafts` reads exactly those two fields).
//   * They cannot set `state` or `authority`. Those are the engine's to assign -- a client that
//     could submit them could hand over a step claiming to be already `executed`.
//   * An action is one of the containment rungs or NONE (an investigative step). The select offers
//     exactly those; there is no free-text action to mistype into a step the engine will refuse.
//
// Editing is refused once a plan is approved, so this is never offered on one -- an edit under a
// recorded authorization would make the audit trail say an operator approved steps they never saw.

import { useState, type ReactElement } from 'react';
import { RESPONSE_ACTIONS, type ResponseAction, type ResponseStep } from '@forge/contracts';

/**
 * A step being edited. `action` is the empty string for an investigative step.
 *
 * `key` is a render identity, never submitted: rows are positional and their titles are editable, so
 * neither index nor title is stable enough to key React on across an add or a remove.
 */
interface DraftRow {
  readonly key: string;
  readonly title: string;
  readonly action: string;
}

let nextRowKey = 0;
function rowKey(): string {
  nextRowKey += 1;
  return `row-${String(nextRowKey)}`;
}

function toRows(steps: readonly ResponseStep[]): DraftRow[] {
  return steps.map((step) => ({ key: rowKey(), title: step.title, action: step.action ?? '' }));
}

export interface SocPlanEditorProps {
  readonly steps: readonly ResponseStep[];
  readonly saving: boolean;
  readonly onSave: (steps: readonly { title: string; action: ResponseAction | null }[]) => void;
  readonly onCancel: () => void;
}

export function SocPlanEditor({
  steps,
  saving,
  onSave,
  onCancel,
}: SocPlanEditorProps): ReactElement {
  const [rows, setRows] = useState<DraftRow[]>(() => toRows(steps));

  function update(index: number, patch: Partial<DraftRow>): void {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // A step with no title is one an operator would be approving as a blank line, and the engine
  // refuses it. Catching it here means the refusal is a disabled button rather than a round trip.
  const invalid = rows.some((row) => row.title.trim() === '');

  return (
    <form
      className="fcx-socp"
      aria-label="Modify the response plan"
      data-testid="soc-plan-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(
          rows.map((row) => ({
            title: row.title.trim(),
            action: row.action === '' ? null : (row.action as ResponseAction),
          })),
        );
      }}
    >
      <ol className="fcx-socp__rows">
        {rows.map((row, index) => (
          <li key={row.key} className="fcx-socp__row">
            <label className="fcx-socp__field">
              <span className="fcx-socp__label">Step {index + 1}</span>
              <input
                type="text"
                className="fcx-socp__input"
                value={row.title}
                aria-label={`Step ${String(index + 1)} title`}
                onChange={(event) => {
                  update(index, { title: event.target.value });
                }}
              />
            </label>
            <label className="fcx-socp__field">
              <span className="fcx-socp__label">Action</span>
              <select
                className="fcx-socp__select"
                value={row.action}
                aria-label={`Step ${String(index + 1)} action`}
                onChange={(event) => {
                  update(index, { action: event.target.value });
                }}
              >
                {/* Investigative is a real step, not a missing value: it changes no state and needs
                    no enforcement to complete. */}
                <option value="">Investigate (no containment)</option>
                {RESPONSE_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="fcx-socp__drop"
              aria-label={`Remove step ${String(index + 1)}`}
              onClick={() => {
                setRows((current) => current.filter((entry) => entry.key !== row.key));
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>

      <div className="fcx-socp__controls">
        <button
          type="button"
          className="fcx-socv__control"
          onClick={() => {
            setRows((current) => [...current, { key: rowKey(), title: '', action: '' }]);
          }}
        >
          Add step
        </button>
        <button type="submit" className="fcx-socv__control" disabled={invalid || saving}>
          Save plan
        </button>
        <button type="button" className="fcx-socv__control" onClick={onCancel}>
          Cancel
        </button>
        {invalid ? (
          <span className="fcx-socv__controls-note">
            Every step needs a title. The engine refuses a blank one.
          </span>
        ) : (
          <span className="fcx-socv__controls-note">
            Saving replaces the proposed steps and bumps the revision, so an approval issued against
            the old plan is refused rather than applied.
          </span>
        )}
      </div>
    </form>
  );
}
