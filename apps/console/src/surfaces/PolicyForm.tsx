// apps/console/src/surfaces/PolicyForm.tsx -- the Create/Edit Policy authoring form (P5.4).
//
// The operator authors a per-VTZ Forge policy (TRD-CONSOLE-05 Section 3, grounded on `08-*.png`): a name;
// the zone it scopes; the Subjects (Who) and Targets (What) it governs (real objects from the catalog);
// the network qualifier (protocol chips + ports); the lattice Action; the logging level; the optional
// Restrictions (schedule + geo + tags) and Advanced (Applied-To + classification + description). One
// policy authors the cross-product ruleset (each subject x target -> a Rule with the chosen action).
//
// Save-as-Draft authors a Draft; Save-&-Publish authors then publishes (confirm-gated; the engine's
// breaking flag is surfaced from the publish ack, never guessed). Client-side validation refuses an
// incomplete/ill-formed draft before the BFF, which re-validates as the authority (a typed 400/409/403).
//
// DEFERRED (honest): the absolute active-window (from/until) is an engine HLC with no Console-facing
// wall-clock conversion, so authoring a datetime would emit a wrong-scale bound (a governance lie). Its
// authoring is deferred; the recurring schedule + geo + tags ARE authored here. Applied-To is authored as
// endpoint CNs (there is no enrollable-endpoint list read yet); an empty Applied-To distributes nowhere.

import { useMemo, useState, type ReactElement } from 'react';
import { AccordionGroup, Badge, ConfirmDialog } from '@forge/design';
import type {
  ObjectCard,
  PolicyAction,
  PolicyClassification,
  PolicyDraft,
  PolicyLogging,
  PolicyProtocol,
  PolicyRow,
  RuleEndpoint,
  ScheduleDay,
} from '@forge/contracts';
import {
  POLICY_ACTIONS,
  POLICY_CLASSIFICATIONS,
  POLICY_LOGGING,
  POLICY_PROTOCOLS,
  SCHEDULE_DAYS,
  policyActionLabel,
  policyLoggingLabel,
  policyProtocolLabel,
} from '@forge/contracts';

import { useObjects } from './useObjects.js';
import { useVtzTree } from './useVtzTree.js';
import { PolicyCommandError, useSavePolicy } from './usePolicyMutation.js';

/** Validate a canonical port list (`80, 443, 8080-8090`): ports/ranges in 1-65535. Empty = valid (any). */
export function portsValid(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return true;
  return trimmed.split(',').every((raw) => {
    const entry = raw.trim();
    const range = /^(\d{1,5})-(\d{1,5})$/.exec(entry);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      return start >= 1 && end <= 65535 && start < end;
    }
    if (!/^\d{1,5}$/.test(entry)) return false;
    const port = Number(entry);
    return port >= 1 && port <= 65535;
  });
}

/** Map an object card to a rule endpoint (its kind + typed selector). */
function toEndpoint(card: ObjectCard): RuleEndpoint {
  return { kind: card.kind, selectorKind: card.selectorKind, selectorValue: card.selectorValue };
}

/** The typed failure line for the command. */
function commandFailure(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof PolicyCommandError) {
    if (error.status === 409)
      return 'A policy with that name already exists in the zone, or the version conflicts.';
    if (error.status === 400)
      return 'The policy is incomplete or a field does not fit the engine contract.';
    if (error.status === 403) return 'The engine refused the command (not authorized).';
    return 'The engine refused the command.';
  }
  return 'The command could not reach the engine.';
}

/** Split a comma-separated free-text field into trimmed non-empty entries. */
function splitCsv(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Minutes since midnight from an `HH:MM` time input, or null when empty. */
function minutesOf(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** An `HH:MM` string from minutes-since-midnight, or '' when null. */
function timeOf(minutes: number | null): string {
  if (minutes === null) return '';
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function PolicyForm({
  editing,
  onDone,
}: {
  readonly editing: PolicyRow | null;
  readonly onDone: () => void;
}): ReactElement {
  const save = useSavePolicy();
  const objects = useObjects();
  const tree = useVtzTree();

  // Seed the form from the edited record, or the empty create shape.
  const [name, setName] = useState(editing?.name ?? '');
  const [vtz, setVtz] = useState(editing?.vtz ?? '');
  const [subjects, setSubjects] = useState<readonly string[]>(
    editing ? [...new Set(editing.rules.map((r) => r.source.selectorValue))] : [],
  );
  const [targets, setTargets] = useState<readonly string[]>(
    editing ? [...new Set(editing.rules.map((r) => r.destination.selectorValue))] : [],
  );
  const [protocols, setProtocols] = useState<readonly PolicyProtocol[]>(
    editing?.network.protocols ?? [],
  );
  const [ports, setPorts] = useState(editing?.network.ports ?? '');
  const [action, setAction] = useState<PolicyAction>(editing?.rules[0]?.action ?? 'permit');
  const [logging, setLogging] = useState<PolicyLogging>(editing?.logging ?? 'full');
  const [scheduleDays, setScheduleDays] = useState<readonly ScheduleDay[]>(
    editing?.restrictions.scheduleDays ?? [],
  );
  const [start, setStart] = useState(timeOf(editing?.restrictions.scheduleStartMinute ?? null));
  const [end, setEnd] = useState(timeOf(editing?.restrictions.scheduleEndMinute ?? null));
  const [geo, setGeo] = useState((editing?.restrictions.geo ?? []).join(', '));
  const [tags, setTags] = useState((editing?.restrictions.tags ?? []).join(', '));
  const [appliedTo, setAppliedTo] = useState(
    (editing?.appliedTo ?? []).map((m) => m.endpointCn).join(', '),
  );
  const [description, setDescription] = useState(editing?.description ?? '');
  const [classification, setClassification] = useState<PolicyClassification>(
    editing?.maxClassification ?? 'internal',
  );
  const [confirmPublish, setConfirmPublish] = useState(false);

  const catalog = useMemo(() => objects.data ?? [], [objects.data]);
  const byValue = useMemo(() => {
    const map = new Map<string, ObjectCard>();
    for (const card of catalog) map.set(card.selectorValue, card);
    return map;
  }, [catalog]);

  const portsOk = portsValid(ports);
  const complete = name.trim() !== '' && vtz !== '' && subjects.length > 0 && targets.length > 0;
  const valid = complete && portsOk;

  const buildDraft = (): PolicyDraft => {
    const sources = subjects
      .map((v) => byValue.get(v))
      .filter((c): c is ObjectCard => c !== undefined);
    const dests = targets
      .map((v) => byValue.get(v))
      .filter((c): c is ObjectCard => c !== undefined);
    const rules = sources.flatMap((s) =>
      dests.map((t) => ({ source: toEndpoint(s), destination: toEndpoint(t), action })),
    );
    return {
      vtz,
      name: name.trim(),
      description: description.trim(),
      rules,
      network: { protocols: [...protocols], ports: ports.trim() },
      restrictions: {
        scheduleDays: [...scheduleDays],
        scheduleStartMinute: minutesOf(start),
        scheduleEndMinute: minutesOf(end),
        activeFrom: null,
        activeUntil: null,
        geo: splitCsv(geo),
        tags: splitCsv(tags),
      },
      logging,
      appliedTo: splitCsv(appliedTo).map((cn) => ({ endpointCn: cn, agent: null })),
      maxClassification: classification,
    };
  };

  const commit = (publish: boolean): void => {
    if (!valid) return;
    save.mutate(
      {
        mode: editing === null ? 'create' : 'edit',
        id: editing?.id ?? null,
        vtz,
        draft: buildDraft(),
        publish,
      },
      {
        // A BREAKING publish (the engine revoked previously granted access) keeps the form open so
        // the operator SEES the flag (the acceptance row "a breaking publish is flagged"); closing
        // unconditionally would render the notice unreachable. Cancel then dismisses.
        onSuccess: (result) => {
          if (!result.breaking) {
            onDone();
          }
        },
      },
    );
  };

  const toggle = <T,>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const failure = commandFailure(save.error);
  const result = save.data ?? null;

  return (
    <form
      className="fcx-policy-form"
      aria-label={editing === null ? 'Create a policy' : `Edit ${editing.name}`}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="fcx-policy-form__grid">
        <label className="fcx-filter">
          Policy Name
          <input
            className="fcx-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={editing !== null}
            required
          />
        </label>
        <label className="fcx-filter">
          Zone
          <select className="fcx-select" value={vtz} onChange={(e) => setVtz(e.target.value)}>
            <option value="">Select a zone</option>
            {(tree.data?.zones ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fcx-policy-form__grid">
        <label className="fcx-filter">
          Subjects (Who)
          <select
            className="fcx-select"
            multiple
            aria-label="Subjects"
            value={[...subjects]}
            onChange={(e) => setSubjects([...e.target.selectedOptions].map((o) => o.value))}
          >
            {catalog.map((c) => (
              <option key={`s-${c.name}`} value={c.selectorValue}>
                {c.kind}:{c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="fcx-filter">
          Targets (What)
          <select
            className="fcx-select"
            multiple
            aria-label="Targets"
            value={[...targets]}
            onChange={(e) => setTargets([...e.target.selectedOptions].map((o) => o.value))}
          >
            {catalog.map((c) => (
              <option key={`t-${c.name}`} value={c.selectorValue}>
                {c.kind}:{c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="fcx-policy-form__protocols">
        <legend>Protocol</legend>
        {POLICY_PROTOCOLS.map((p) => (
          <label key={p} className="fcx-chip-toggle">
            <input
              type="checkbox"
              checked={protocols.includes(p)}
              onChange={() => setProtocols((prev) => toggle(prev, p))}
            />
            {policyProtocolLabel(p)}
          </label>
        ))}
        <label className="fcx-filter">
          Ports
          <input
            className="fcx-input"
            value={ports}
            onChange={(e) => setPorts(e.target.value)}
            placeholder="80, 443, 8080-8090"
            aria-invalid={!portsOk}
          />
        </label>
      </fieldset>

      <div className="fcx-policy-form__grid">
        <label className="fcx-filter">
          Action
          <select
            className="fcx-select"
            value={action}
            onChange={(e) => setAction(e.target.value as PolicyAction)}
          >
            {POLICY_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {policyActionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="fcx-filter">
          Logging Level
          <select
            className="fcx-select"
            value={logging}
            onChange={(e) => setLogging(e.target.value as PolicyLogging)}
          >
            {POLICY_LOGGING.map((l) => (
              <option key={l} value={l}>
                {policyLoggingLabel(l)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AccordionGroup title="Restrictions (Optional)" label="Restrictions (Optional)">
        <fieldset className="fcx-policy-form__days">
          <legend>Days</legend>
          {SCHEDULE_DAYS.map((d) => (
            <label key={d} className="fcx-chip-toggle">
              <input
                type="checkbox"
                checked={scheduleDays.includes(d)}
                onChange={() => setScheduleDays((prev) => toggle(prev, d))}
              />
              {d}
            </label>
          ))}
        </fieldset>
        <div className="fcx-policy-form__grid">
          <label className="fcx-filter">
            From (hour)
            <input
              type="time"
              className="fcx-input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="fcx-filter">
            To (hour)
            <input
              type="time"
              className="fcx-input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="fcx-filter">
          Geo allowlist (comma-separated)
          <input className="fcx-input" value={geo} onChange={(e) => setGeo(e.target.value)} />
        </label>
        <label className="fcx-filter">
          Tags (comma-separated)
          <input className="fcx-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </AccordionGroup>

      <AccordionGroup title="Advanced Settings" label="Advanced Settings">
        <label className="fcx-filter">
          Applied To (endpoint CNs, comma-separated)
          <input
            className="fcx-input"
            value={appliedTo}
            onChange={(e) => setAppliedTo(e.target.value)}
            placeholder="host-01.corp, host-02.corp"
          />
        </label>
        <label className="fcx-filter">
          Max Classification
          <select
            className="fcx-select"
            value={classification}
            onChange={(e) => setClassification(e.target.value as PolicyClassification)}
          >
            {POLICY_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="fcx-filter">
          Description
          <input
            className="fcx-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </AccordionGroup>

      {!portsOk ? (
        <p role="alert" className="fcx-form-error">
          The port list must be ports or `start-end` ranges within 1-65535.
        </p>
      ) : null}
      {failure !== null ? (
        <p role="alert" className="fcx-form-error">
          {failure}
        </p>
      ) : null}
      {result !== null && result.breaking ? (
        <p role="status" className="fcx-form-note">
          Published as a <Badge variant="caution">breaking</Badge> change (it revoked previously
          granted access).
        </p>
      ) : null}

      <div className="fcx-policy-form__actions">
        <button type="button" className="fcx-btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="fcx-btn"
          disabled={!valid || save.isPending}
          onClick={() => commit(false)}
        >
          {save.isPending ? 'Saving...' : 'Save as Draft'}
        </button>
        <button
          type="button"
          className="fcx-btn fcx-btn--primary"
          disabled={!valid || save.isPending}
          onClick={() => setConfirmPublish(true)}
        >
          Save &amp; Publish
        </button>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        title="Publish this policy?"
        description="Publishing authors the version and makes it available to distribute to its Applied-To endpoints. A breaking change (revoking prior access) is flagged after it commits. Enforcement stays off until separately engaged."
        confirmLabel="Publish"
        onConfirm={() => {
          setConfirmPublish(false);
          commit(true);
        }}
        onCancel={() => setConfirmPublish(false)}
      />
    </form>
  );
}
