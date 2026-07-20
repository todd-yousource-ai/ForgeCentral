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
// PARENT IS A FIELD, SO MOVING IS PART OF SAVING. Changing the parent is an ordinary edit to the operator:
// they pick a new parent and press Save. The engine decomposes that into two audited verbs (`vtz.edit` for
// the settings, `vtz.rescope` for the move, because the dotted name is the hierarchy), but that is the
// engine's shape, not a workflow to impose on the operator. The confirm dialog NAMES the move when there
// is one -- folding the act into Save must not make it invisible on an audited surface.
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

/**
 * The operator-facing explanation of a failed command. Names the rule class, never a fabricated cause.
 *
 * `settingsCommitted` reports the one partial outcome a Save can produce: the settings reached the store
 * and the move did not. Saying "nothing was committed" there would be false.
 */
export function failureMessage(failure: VtzCommandFailure, settingsCommitted = false): string {
  const outcome = settingsCommitted
    ? 'The settings were committed; the zone was NOT moved and stays where it was.'
    : 'Nothing was committed.';
  if (failure === 'denied') {
    return `The engine refused this change: it contradicts a rule the platform enforces on every zone. ${outcome}`;
  }
  if (failure === 'conflict') {
    return `The engine refused this change: the zone already exists, no longer exists, or still has sub-zones. ${outcome} Re-read the tree and try again.`;
  }
  if (failure === 'malformed') {
    return `That zone definition was rejected before it reached the engine. ${outcome}`;
  }
  return `The zone could not be reached. ${outcome}`;
}

/**
 * Split a dotted zone name into its parent prefix and its own leaf segment: `Demo.sales.reps` is the leaf
 * `reps` under the parent `Demo.sales`. A name with no dot is a top-level zone (empty parent).
 */
export function splitZoneName(name: string): { parent: string; leaf: string } {
  const cut = name.lastIndexOf('.');
  if (cut === -1) return { parent: '', leaf: name };
  return { parent: name.slice(0, cut), leaf: name.slice(cut + 1) };
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

/** Why the last command did not commit, and whether the settings half of a Save reached the store. */
export interface EditorFailure {
  readonly kind: VtzCommandFailure;
  readonly settingsCommitted: boolean;
}

export interface VtzEditorProps {
  /** `create` authors a new zone; `edit` configures `zone`. */
  readonly mode: 'create' | 'edit';
  /** The zone being configured. Null in create mode. */
  readonly zone: VtzZone | null;
  /** Every zone that may be chosen as a parent. */
  readonly parents: readonly VtzZone[];
  /** True while a command is in flight (every control disables, so nothing is double-submitted). */
  readonly busy: boolean;
  /** Why the last command did not commit, or null. */
  readonly failure: EditorFailure | null;
  /**
   * Commit the zone: `vtz.create` in create mode, otherwise the settings plus, when `moveTo` is non-null,
   * the move to that dotted name.
   */
  readonly onSubmit: (spec: VtzSpecInput, moveTo: string | null) => void;
  /** Delete the zone (`vtz.delete`). Edit mode only. */
  readonly onDelete?: () => void;
  /** Abandon a create. */
  readonly onCancel?: () => void;
}

/** The pending confirm, if any: which audited act the operator is being asked to authorize. */
type Pending = null | { readonly kind: 'submit' } | { readonly kind: 'delete' };

export function VtzEditor({
  mode,
  zone,
  parents,
  busy,
  failure,
  onSubmit,
  onDelete,
  onCancel,
}: VtzEditorProps): ReactElement {
  // `leaf` is the zone's own segment and the parent select supplies the dotted prefix, in BOTH modes: an
  // existing zone opens on its current place in the tree, so re-parenting it is picking a different one.
  const initial = zone !== null ? splitZoneName(zone.name) : { parent: '', leaf: '' };
  const [leaf, setLeaf] = useState(initial.leaf);
  const [parentName, setParentName] = useState(initial.parent);
  const [form, setForm] = useState<FormState>({
    description: '',
    zoneType: zone?.zoneType ?? 'standard',
    telemetry: zone?.telemetry ?? 'full',
    lifecycle: zone?.lifecycle ?? 'draft',
    microSegmentation: zone?.microSegmentation ?? true,
    reauthIntervalHours: zone?.reauthIntervalHours ?? 8,
  });
  const [pending, setPending] = useState<Pending>(null);

  // The engine refuses to move a zone that still has descendants (it would orphan them), so the Console
  // says so up front instead of offering a control that can only end in a refusal.
  const moveBlocked = mode === 'edit' && (zone?.subZoneCount ?? 0) > 0;
  // A zone can be neither its own parent nor its own descendant's child.
  const selectableParents =
    zone === null
      ? parents
      : parents.filter((p) => p.name !== zone.name && !p.name.startsWith(`${zone.name}.`));

  const composed = composeZoneName(parentName, leaf);
  const canSubmit = !busy && composed !== '';
  // A move is simply the composed name landing somewhere other than where the zone already is.
  const moveTo = mode === 'edit' && zone !== null && composed !== zone.name ? composed : null;

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
    if (act.kind === 'submit') onSubmit(specFromForm(), moveTo);
    else onDelete?.();
  }

  return (
    <div className="fcx-vtz-editor">
      {failure !== null ? (
        <p className="fcx-vtz-editor__failure" role="alert">
          {failureMessage(failure.kind, failure.settingsCommitted)}
        </p>
      ) : null}

      <div className="fcx-vtz-editor__fields">
        <label className="fcx-field">
          <span className="fcx-field__label">VTZ name</span>
          <input
            type="text"
            className="fcx-input"
            aria-label="VTZ name"
            value={leaf}
            disabled={busy}
            placeholder="reps"
            onChange={(e) => setLeaf(e.target.value)}
          />
          {composed !== '' ? (
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
            disabled={busy || moveBlocked}
            onChange={(e) => setParentName(e.target.value)}
          >
            <option value="">None (top-level zone)</option>
            {selectableParents.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="fcx-field__note">
            {moveBlocked
              ? 'This zone has sub-zones, so the engine refuses to move it -- moving it would orphan them. Re-parent or remove them first.'
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

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'delete'
            ? `Delete ${zone?.name ?? 'this zone'}?`
            : mode === 'create'
              ? `Create ${composed}?`
              : moveTo !== null
                ? `Save ${zone?.name ?? 'this zone'} and move it to ${moveTo}?`
                : `Save changes to ${zone?.name ?? 'this zone'}?`
        }
        description={
          pending?.kind === 'delete'
            ? 'This is an audited change to the trust-zone system of record. The engine refuses to delete a zone that still has sub-zones.'
            : moveTo !== null
              ? // Folding the move into Save must not hide it: the move is a second audited write, and a
                // zone's place in the tree is what its inherited posture depends on.
                'This is an audited change to the trust-zone system of record, attributed to you. Moving the zone changes its full name and the posture it inherits; it is recorded as a separate audited write from the settings.'
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
