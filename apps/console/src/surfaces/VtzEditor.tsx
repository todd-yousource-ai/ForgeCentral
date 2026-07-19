// apps/console/src/surfaces/VtzEditor.tsx -- the zone authoring form (IP-CONSOLE-02 V2.5).
//
// One form for both authoring paths: creating a zone and configuring an existing one.
//
// A VTZ IS THE POLICY EDGE, NOT THE POLICY. The zone is a virtual construct that policies TARGET: this
// form authors the zone's identity, its nesting, and its operational settings, and nothing here grants or
// denies anything. The governing rules are authored against the zone on the Policies surface, and the
// archetype only declares which kind of policy the zone is meant to receive. That is why no posture is
// authored here: the engine resolves every unauthored domain to `deny` on its own (fail-closed, the same
// thing its own zone seed produces), so an empty matrix is correct rather than a gap.
//
// NESTING IS A FIELD, NOT A NAMING CONVENTION. Every zone stands alone; `Parent VTZ (Optional)` is what
// nests it. The engine's hierarchy IS the dotted name, so choosing a parent composes the full name --
// pick `Demo.sales`, name the zone `reps`, and it commits as `Demo.sales.reps`. Nothing is a root by
// privilege: a zone with no parent is simply top-level, and it can be edited and deleted like any other.
//
// THREE SEPARATE VERBS, THREE SEPARATE ACTIONS. The engine models a rename as a RE-SCOPE, not an edit,
// so Save never silently becomes two audited writes: Save commits the settings (`vtz.edit`), Re-scope
// commits the move (`vtz.rescope`), Delete removes the zone (`vtz.delete`). Each is separately confirmed.
//
// The form initializes from its props once; the surface remounts it with a `key` when the selected zone
// changes, so there is no state-sync effect to get wrong.

import { useState, type ReactElement } from 'react';
import { ConfirmDialog } from '@forge/design';
import {
  MAX_REAUTH_INTERVAL_HOURS,
  MIN_REAUTH_INTERVAL_HOURS,
  VTZ_ARCHETYPES,
  type VtzArchetype,
  type VtzLifecycle,
  type VtzSpecInput,
  type VtzTelemetry,
  type VtzZone,
} from '@forge/contracts';

import type { VtzCommandFailure } from './useVtzMutation.js';

/** The operator-facing label for each archetype: what kind of policy the zone is meant to receive. */
export const ARCHETYPE_LABEL: Readonly<Record<VtzArchetype, string>> = {
  standard: 'Standard',
  quarantine: 'Quarantine',
  isolation: 'Isolation',
  public: 'Public',
  observability: 'Observability',
};

/** One line of help per archetype, so the choice is not a bare word. */
const ARCHETYPE_HINT: Readonly<Record<VtzArchetype, string>> = {
  standard: 'Takes general policy authored on the Policies surface.',
  quarantine: 'Holds its members under restriction while a disposition is worked.',
  isolation: 'Deny-all: the quick cut-off used to contain.',
  public: 'The least-trusted edge; reserved for the future full-kernel policy.',
  observability:
    'Visibility first: an agent is fully onboarded and wrapped here, under a permissive (any/any) policy authored on the Policies surface.',
};

/** The operator-facing explanation of a failed command. Names the rule class, never a fabricated cause. */
export function failureMessage(failure: VtzCommandFailure): string {
  if (failure === 'denied') {
    return 'The engine refused this change: it contradicts a rule the platform enforces on every zone. Nothing was committed.';
  }
  if (failure === 'conflict') {
    return 'The engine refused this change: the zone already exists, no longer exists, or still has sub-zones. Nothing was committed. Re-read the tree and try again.';
  }
  if (failure === 'malformed') {
    return 'That zone definition was rejected before it reached the engine. Nothing was committed.';
  }
  return 'The zone could not be reached. Nothing was committed.';
}

/**
 * The full dotted name a zone commits under: its parent's name and its own leaf, joined. An empty parent
 * yields a top-level zone. This is the ONE place nesting is expressed, because the engine derives a
 * zone's parent from its name's lexical prefix.
 */
export function composeZoneName(parentName: string, leaf: string): string {
  const trimmed = leaf.trim();
  const parent = parentName.trim();
  if (trimmed === '') return '';
  return parent === '' ? trimmed : `${parent}.${trimmed}`;
}

/** The editable settings. No posture: this surface authors the zone, not the policy applied to it. */
interface FormState {
  readonly description: string;
  readonly zoneType: VtzArchetype;
  readonly telemetry: VtzTelemetry;
  readonly lifecycle: VtzLifecycle;
  readonly microSegmentation: boolean;
  readonly reauthIntervalHours: number;
}

export interface VtzEditorProps {
  /** `create` authors a new zone; `edit` configures `zone`. */
  readonly mode: 'create' | 'edit';
  /** The zone being configured. Null in create mode. */
  readonly zone: VtzZone | null;
  /** Every zone that may be chosen as a parent (create mode). */
  readonly parents: readonly VtzZone[];
  /** True while a command is in flight (every control disables, so nothing is double-submitted). */
  readonly busy: boolean;
  /** Why the last command did not commit, or null. */
  readonly failure: VtzCommandFailure | null;
  /** Commit the zone (`vtz.create` in create mode, `vtz.edit` in edit mode). */
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
  parents,
  busy,
  failure,
  onSubmit,
  onRescope,
  onDelete,
  onCancel,
}: VtzEditorProps): ReactElement {
  // In create mode `leaf` is the zone's own segment and the parent select supplies the prefix. In edit
  // mode the name is the zone's identity, and only a re-scope may change it.
  const [leaf, setLeaf] = useState('');
  const [parentName, setParentName] = useState('');
  const [rescopeName, setRescopeName] = useState(zone?.name ?? '');
  const [form, setForm] = useState<FormState>({
    description: '',
    zoneType: zone?.zoneType ?? 'standard',
    telemetry: zone?.telemetry ?? 'full',
    lifecycle: zone?.lifecycle ?? 'draft',
    microSegmentation: zone?.microSegmentation ?? true,
    reauthIntervalHours: zone?.reauthIntervalHours ?? 8,
  });
  const [pending, setPending] = useState<Pending>(null);

  const composed = mode === 'create' ? composeZoneName(parentName, leaf) : (zone?.name ?? '');
  const canSubmit = !busy && composed !== '';
  const canRescope =
    !busy && rescopeName.trim() !== '' && zone !== null && rescopeName.trim() !== zone.name;

  function specFromForm(): VtzSpecInput {
    return {
      name: composed,
      description: form.description,
      zoneType: form.zoneType,
      // Empty by design: the zone is the policy target, not the policy. The engine resolves every
      // unauthored domain to `deny`, so this is the fail-closed zone, never a permissive guess.
      ownPostures: [],
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
          <span className="fcx-field__label">VTZ name</span>
          <input
            type="text"
            className="fcx-input"
            aria-label="VTZ name"
            value={mode === 'create' ? leaf : (zone?.name ?? '')}
            disabled={busy || mode === 'edit'}
            placeholder="reps"
            onChange={(e) => setLeaf(e.target.value)}
          />
          {mode === 'create' && composed !== '' ? (
            <span className="fcx-field__note">
              Commits as <code>{composed}</code>
            </span>
          ) : null}
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">VTZ type</span>
          <select
            className="fcx-input"
            aria-label="VTZ type"
            value={form.zoneType}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, zoneType: e.target.value as VtzArchetype }))}
          >
            {VTZ_ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {ARCHETYPE_LABEL[a]}
              </option>
            ))}
          </select>
          <span className="fcx-field__note">{ARCHETYPE_HINT[form.zoneType]}</span>
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">Parent VTZ (optional)</span>
          <select
            className="fcx-input"
            aria-label="Parent VTZ (optional)"
            value={parentName}
            disabled={busy || mode === 'edit'}
            onChange={(e) => setParentName(e.target.value)}
          >
            <option value="">None (top-level zone)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="fcx-field__note">
            {mode === 'edit'
              ? 'Moving a zone is a separate audited act -- use Re-scope below.'
              : 'Nests this zone under the chosen parent. Leave as None for a stand-alone zone.'}
          </span>
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">Description</span>
          <input
            type="text"
            className="fcx-input"
            aria-label="Description"
            value={form.description}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          {/* NAMED GAP (cross-repo): the engine ACCEPTS a description on a spec but does not return one
              on a zone read (`WireVtzTreeNode` carries no description field), so the Console cannot show
              the stored value. Rather than silently overwrite it, say so. Closes when crdb adds it. */}
          {mode === 'edit' ? (
            <span className="fcx-field__note">
              The engine does not return the stored description, so saving replaces it.
            </span>
          ) : null}
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">Session duration (hours)</span>
          <input
            type="number"
            className="fcx-input"
            aria-label="Session duration (hours)"
            min={MIN_REAUTH_INTERVAL_HOURS}
            max={MAX_REAUTH_INTERVAL_HOURS}
            value={form.reauthIntervalHours}
            disabled={busy}
            onChange={(e) =>
              setForm((f) => ({ ...f, reauthIntervalHours: Number(e.target.value) }))
            }
          />
          <span className="fcx-field__note">
            How long before a member must log in again (1-24).
          </span>
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">Telemetry mode</span>
          <select
            className="fcx-input"
            aria-label="Telemetry mode"
            value={form.telemetry}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, telemetry: e.target.value as VtzTelemetry }))}
          >
            <option value="full">Full</option>
            <option value="sampled">Sampled</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label className="fcx-field fcx-field--inline">
          <input
            type="checkbox"
            aria-label="Micro-segmentation"
            checked={form.microSegmentation}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, microSegmentation: e.target.checked }))}
          />
          <span className="fcx-field__label">Micro-segmentation</span>
        </label>

        <label className="fcx-field">
          <span className="fcx-field__label">Lifecycle</span>
          <select
            className="fcx-input"
            aria-label="Lifecycle"
            value={form.lifecycle}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, lifecycle: e.target.value as VtzLifecycle }))}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>

      <p className="fcx-vtz-editor__note">
        A trust zone is the policy edge: this defines the zone and where it sits. The rules that
        govern its members are authored against it on the Policies surface.
      </p>

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
              aria-label="Re-scope (move) to"
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
            The dotted name is the hierarchy, so moving a zone under a different parent is a rename.
            It is a separate audited act from saving this zone settings.
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
                ? `Create ${composed}?`
                : `Save changes to ${zone?.name ?? 'this zone'}?`
        }
        description={
          pending?.kind === 'delete'
            ? 'This is an audited change to the trust-zone system of record. The engine refuses to delete a zone that still has sub-zones.'
            : 'This is an audited change to the trust-zone system of record, attributed to you.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Commit'}
        tone={pending?.kind === 'delete' ? 'critical' : 'default'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
