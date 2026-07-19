// apps/console/src/surfaces/VtzEditor.tsx -- the zone authoring form (IP-CONSOLE-02 V2.5).
//
// One form for both authoring paths: creating a zone and configuring an existing one. It edits the zone's
// settings and its per-domain posture matrix, previews the tighten-only effective result live, and commits
// through the audited engine verbs behind a confirm.
//
// THREE SEPARATE VERBS, THREE SEPARATE ACTIONS. The engine models a rename as a RE-SCOPE, not an edit,
// because the dotted name IS the hierarchy. So the form does not silently turn a Save into two audited
// writes: Save commits settings + postures (`vtz.edit`), Re-scope commits the move (`vtz.rescope`), and
// Delete removes the zone (`vtz.delete`). Each is separately confirmed, so the operator always knows which
// audited act they authorized.
//
// THE PREVIEW IS A PREVIEW. The effective column composes the operator's in-progress edit with the PARENT
// zone's effective postures (a real `vtz.detail` read, which already carries the whole ancestor chain), so
// it is exact rather than guessed. The engine recomposes and re-validates on commit regardless and refuses
// a contradiction -- the form never gets the last word on policy.
//
// The form initializes from its props once; the surface remounts it with a `key` when the selected zone
// changes, so there is no state-sync effect to get wrong.

import { useMemo, useState, type ReactElement } from 'react';
import { ConfirmDialog, PostureMatrixEditor, type PostureRow } from '@forge/design';
import {
  MAX_REAUTH_INTERVAL_HOURS,
  MIN_REAUTH_INTERVAL_HOURS,
  composeEffectivePostures,
  type DomainPosture,
  type VtzArchetype,
  type VtzLifecycle,
  type VtzPosture,
  type VtzSpecInput,
  type VtzTelemetry,
  type VtzZone,
} from '@forge/contracts';

import type { VtzCommandFailure } from './useVtzMutation.js';

/** The operator-facing explanation of a failed command. Names the rule class, never a fabricated cause. */
export function failureMessage(failure: VtzCommandFailure): string {
  if (failure === 'denied') {
    return 'The engine refused this change: it would relax the read-only catastrophic floor, or it contradicts a posture an ancestor zone set. Nothing was committed.';
  }
  if (failure === 'conflict') {
    return 'The engine refused this change: the zone already exists, no longer exists, or still has sub-zones. Nothing was committed. Re-read the tree and try again.';
  }
  if (failure === 'malformed') {
    return 'That zone definition was rejected before it reached the engine. Nothing was committed.';
  }
  return 'The zone could not be reached. Nothing was committed.';
}

/** The editable form state (everything a `VtzSpecInput` needs except the identity-bearing name). */
interface FormState {
  readonly description: string;
  readonly zoneType: VtzArchetype;
  readonly telemetry: VtzTelemetry;
  readonly lifecycle: VtzLifecycle;
  readonly microSegmentation: boolean;
  readonly reauthIntervalHours: number;
  readonly postures: readonly DomainPosture[];
}

export interface VtzEditorProps {
  /** `create` authors a new zone; `edit` configures `zone`. */
  readonly mode: 'create' | 'edit';
  /** The zone being configured. Null in create mode. */
  readonly zone: VtzZone | null;
  /**
   * The inherited contribution: the PARENT zone's effective postures, which already carry the whole
   * ancestor chain. Empty for a root zone (nothing above it) -- then effective equals own.
   */
  readonly inherited: readonly DomainPosture[];
  /** The parent zone's dotted name, for display. Null for a root zone. */
  readonly parentName: string | null;
  /** True while a command is in flight (every control disables, so nothing is double-submitted). */
  readonly busy: boolean;
  /** Why the last command did not commit, or null. */
  readonly failure: VtzCommandFailure | null;
  /** Commit the settings + postures (`vtz.create` in create mode, `vtz.edit` in edit mode). */
  readonly onSubmit: (spec: VtzSpecInput) => void;
  /** Move the zone to a new dotted name (`vtz.rescope`). Edit mode only. */
  readonly onRescope?: (newName: string) => void;
  /** Delete the zone (`vtz.delete`). Edit mode only. */
  readonly onDelete?: () => void;
  /** Abandon a create. */
  readonly onCancel?: () => void;
}

/** The pending confirm, if any: which audited act the operator is being asked to authorize. */
type Pending =
  null | { readonly kind: 'submit' } | { readonly kind: 'rescope' } | { readonly kind: 'delete' };

export function VtzEditor({
  mode,
  zone,
  inherited,
  parentName,
  busy,
  failure,
  onSubmit,
  onRescope,
  onDelete,
  onCancel,
}: VtzEditorProps): ReactElement {
  // In create mode the matrix seeds from the parent's effective postures: a child cannot be laxer than its
  // ancestors anyway, so the tightest legal starting point is the real inherited one. Never a hardcoded
  // default table (INV-CONSOLE-NO-STUB) -- if there is no parent yet the matrix is empty and Save is off.
  const [name, setName] = useState(mode === 'create' ? '' : (zone?.name ?? ''));
  const [rescopeName, setRescopeName] = useState(zone?.name ?? '');
  const [form, setForm] = useState<FormState>({
    description: '',
    zoneType: zone?.zoneType ?? 'standard',
    telemetry: zone?.telemetry ?? 'full',
    lifecycle: zone?.lifecycle ?? 'draft',
    microSegmentation: zone?.microSegmentation ?? true,
    reauthIntervalHours: zone?.reauthIntervalHours ?? 8,
    postures: zone?.ownPostures ?? inherited,
  });
  const [pending, setPending] = useState<Pending>(null);

  // The live preview: the operator's in-progress matrix composed with the real ancestor chain.
  const rows = useMemo<readonly PostureRow[]>(() => {
    const effective = new Map(
      composeEffectivePostures(form.postures, inherited).map((p) => [p.domain, p]),
    );
    return form.postures.map((p) => ({
      domain: p.domain,
      own: p.posture,
      effective: effective.get(p.domain)?.posture ?? p.posture,
      floor: p.floor || (effective.get(p.domain)?.floor ?? false),
    }));
  }, [form.postures, inherited]);

  const trimmedName = name.trim();
  const canSubmit =
    !busy && trimmedName !== '' && form.postures.length > 0 && (mode === 'edit' || rows.length > 0);
  const canRescope =
    !busy && rescopeName.trim() !== '' && zone !== null && rescopeName.trim() !== zone.name;

  function setPosture(domain: string, posture: VtzPosture): void {
    setForm((f) => ({
      ...f,
      postures: f.postures.map((p) => (p.domain === domain ? { ...p, posture } : p)),
    }));
  }

  function specFromForm(): VtzSpecInput {
    return {
      name: trimmedName,
      description: form.description,
      zoneType: form.zoneType,
      ownPostures: form.postures,
      microSegmentation: form.microSegmentation,
      telemetry: form.telemetry,
      reauthIntervalHours: form.reauthIntervalHours,
      lifecycle: form.lifecycle,
    };
  }

  function confirm(): void {
    const act = pending;
    setPending(null);
    if (act === null) return;
    if (act.kind === 'submit') onSubmit(specFromForm());
    else if (act.kind === 'rescope') onRescope?.(rescopeName.trim());
    else onDelete?.();
  }

  return (
    <div className="fcx-vtz-editor">
      {failure !== null ? (
        <p className="fcx-vtz-editor__failure" role="alert">
          {failureMessage(failure)}
        </p>
      ) : null}

      <div className="fcx-vtz-editor__fields">
        <label className="fcx-field">
          <span className="fcx-field__label">Zone name</span>
          <input
            type="text"
            className="fcx-input"
            value={name}
            disabled={busy || mode === 'edit'}
            placeholder="YouSource.Corp.Finance"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Description</span>
          <input
            type="text"
            className="fcx-input"
            value={form.description}
            disabled={busy}
            aria-describedby="vtz-description-note"
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          {/* NAMED GAP (cross-repo): the engine ACCEPTS a description on a spec but does not return one on
              a zone read (`WireVtzTreeNode` carries no description field), so the Console cannot show the
              stored value. Rather than silently overwrite it, the form says plainly that saving replaces
              it. Closes when crdb adds `description` to the zone read. */}
          {mode === 'edit' ? (
            <span id="vtz-description-note" className="fcx-field__note">
              The engine does not return the stored description, so saving replaces it with whatever
              is typed here. Leaving this blank clears it.
            </span>
          ) : null}
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">VTZ type</span>
          <select
            className="fcx-input"
            value={form.zoneType}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, zoneType: e.target.value as VtzArchetype }))}
          >
            <option value="standard">Standard</option>
            <option value="trusted">Trusted</option>
            <option value="isolation">Isolation</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Session duration (hours)</span>
          <input
            type="number"
            className="fcx-input"
            min={MIN_REAUTH_INTERVAL_HOURS}
            max={MAX_REAUTH_INTERVAL_HOURS}
            value={form.reauthIntervalHours}
            disabled={busy}
            onChange={(e) =>
              setForm((f) => ({ ...f, reauthIntervalHours: Number(e.target.value) }))
            }
          />
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Telemetry</span>
          <select
            className="fcx-input"
            value={form.telemetry}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, telemetry: e.target.value as VtzTelemetry }))}
          >
            <option value="full">Full</option>
            <option value="sampled">Sampled</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Lifecycle</span>
          <select
            className="fcx-input"
            value={form.lifecycle}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, lifecycle: e.target.value as VtzLifecycle }))}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="fcx-field fcx-field--inline">
          <input
            type="checkbox"
            checked={form.microSegmentation}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, microSegmentation: e.target.checked }))}
          />
          <span className="fcx-field__label">Micro-segmentation</span>
        </label>
      </div>

      <p className="fcx-vtz-editor__note">
        {parentName === null
          ? 'This is a root zone, so its effective posture is its own.'
          : `Inherits from ${parentName}. Inheritance only tightens: an ancestor deny always wins, and the engine refuses a change that would relax it.`}
      </p>

      <PostureMatrixEditor
        rows={rows}
        onChange={(domain, posture) => setPosture(domain, posture)}
        disabled={busy}
        caption="Per-domain posture: what this zone sets, and what will apply once ancestors compose"
      />

      <div className="fcx-vtz-editor__actions">
        <button
          type="button"
          className="fcx-btn"
          disabled={!canSubmit}
          onClick={() => setPending({ kind: 'submit' })}
        >
          {mode === 'create' ? 'Create zone' : 'Save changes'}
        </button>
        {mode === 'create' && onCancel ? (
          <button type="button" className="fcx-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {mode === 'edit' && onDelete ? (
          <button
            type="button"
            className="fcx-btn"
            disabled={busy}
            onClick={() => setPending({ kind: 'delete' })}
          >
            Delete zone
          </button>
        ) : null}
      </div>

      {mode === 'edit' && onRescope ? (
        <div className="fcx-vtz-editor__rescope">
          <label className="fcx-field">
            <span className="fcx-field__label">Re-scope (move) to</span>
            <input
              type="text"
              className="fcx-input"
              value={rescopeName}
              disabled={busy}
              onChange={(e) => setRescopeName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="fcx-btn"
            disabled={!canRescope}
            onClick={() => setPending({ kind: 'rescope' })}
          >
            Re-scope
          </button>
          <p className="fcx-vtz-editor__note">
            The dotted name is the hierarchy, so moving a zone is a rename. It is a separate audited
            act from saving this zone settings.
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'delete'
            ? `Delete ${zone?.name ?? 'this zone'}?`
            : pending?.kind === 'rescope'
              ? `Move ${zone?.name ?? 'this zone'} to ${rescopeName.trim()}?`
              : mode === 'create'
                ? `Create ${trimmedName}?`
                : `Save changes to ${zone?.name ?? 'this zone'}?`
        }
        description={
          pending?.kind === 'delete'
            ? 'This is an audited change to the trust-zone system of record. The engine refuses to delete a zone that still has sub-zones.'
            : 'This is an audited change to the trust-zone system of record, attributed to you. The engine re-validates the catastrophic floor and inheritance, and refuses rather than correcting.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Commit'}
        tone={pending?.kind === 'delete' ? 'critical' : 'default'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
