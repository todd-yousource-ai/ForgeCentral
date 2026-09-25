// apps/console/src/surfaces/SettingsSectionForms.tsx -- the typed section forms on the Configuration
// tab (IP-CONSOLE-11 ST.2b over crdb IP-CONSOLE-SETTINGS-WIRE SET.2b, INV-SETTINGS-ONE-WRITE-PATH).
//
// One form per LIVE section the engine lets the Console patch. A form is present only when the
// engine marks its section editable (the registry row's `editable`). Each form starts from the
// engine's typed current values, commits ONLY its own section behind a confirm that names it, and
// shows the engine's receipt verbatim. Under dual control the same form PROPOSES instead (ST.9): a
// different Admin approves it on the Changes tab.

import { useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog } from '@forge/design';
import type {
  SectionPatch,
  SectionValues,
  SettingsProposalReceipt,
  SettingsReceipt,
  SettingsView,
} from '@forge/contracts';
import { ADMIN_CAPABILITIES, CLASSIFICATION_TAGS, refusalCauseLabel } from '@forge/contracts';

import { ErrorState, LoadingState } from '../states/States.js';
import { useGovernedChange, type GovernedChangeResult } from './useSettings.js';

/** The engine's receipt for a Configuration commit, verbatim: version and restarts, or every cause. */
export function GovernedReceipt({ receipt }: { readonly receipt: SettingsReceipt }): ReactElement {
  if (!receipt.refused) {
    return (
      <div className="fcx-settings__receipt" data-testid="settings-configuration-receipt">
        <Badge variant="good">Committed</Badge> Committed at version {String(receipt.version)}.
        {receipt.needsRestart.length > 0
          ? ` Committed but not applied until a restart: ${receipt.needsRestart.join(', ')}.`
          : ' Applied live.'}
      </div>
    );
  }
  return (
    <div className="fcx-settings__receipt" data-testid="settings-configuration-receipt">
      <Badge variant="caution">Refused</Badge>{' '}
      {receipt.dualControlRequired
        ? 'Tenant-config is under dual control: propose and approve instead.'
        : (receipt.explanation ?? 'Refused by the engine; nothing was committed.')}
      {receipt.refusedEdits.length > 0 || receipt.violations.length > 0 ? (
        <ul className="fcx-settings__violations" data-testid="settings-configuration-refusals">
          {receipt.refusedEdits.map((r) => (
            <li key={`${r.key}-${r.causeTag}`}>
              <code>{r.key}</code>: {refusalCauseLabel(r)}
              {r.detail === null ? '' : ` (${r.detail})`}
            </li>
          ))}
          {receipt.violations.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The engine's receipt for a proposal (crdb SET.3): the id a different Admin approves, or why not. */
export function ProposalReceipt({
  receipt,
}: {
  readonly receipt: SettingsProposalReceipt;
}): ReactElement {
  if (receipt.proposal !== null) {
    return (
      <div className="fcx-settings__receipt" data-testid="settings-configuration-receipt">
        <Badge variant="neutral">Proposed</Badge> Proposal {String(receipt.proposal)} recorded.
        Nothing is committed until a different Admin approves it on the Changes tab.
      </div>
    );
  }
  return (
    <div className="fcx-settings__receipt" data-testid="settings-configuration-receipt">
      <Badge variant="caution">Refused</Badge>{' '}
      {receipt.explanation ?? 'Refused by the engine; nothing was proposed.'}
      {receipt.refusedEdits.length > 0 || receipt.violations.length > 0 ? (
        <ul className="fcx-settings__violations" data-testid="settings-configuration-refusals">
          {receipt.refusedEdits.map((r) => (
            <li key={`${r.key}-${r.causeTag}`}>
              <code>{r.key}</code>: {refusalCauseLabel(r)}
              {r.detail === null ? '' : ` (${r.detail})`}
            </li>
          ))}
          {receipt.violations.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A commit's or a proposal's receipt, whichever the change produced. */
export function ChangeReceipt({ result }: { readonly result: GovernedChangeResult }): ReactElement {
  return result.kind === 'commit' ? (
    <GovernedReceipt receipt={result.receipt} />
  ) : (
    <ProposalReceipt receipt={result.receipt} />
  );
}

/** The registry key that governs each section form (the row whose `editable` gates it). */
const SECTION_KEYS = {
  dualControl: 'governance.dual_control',
  egressDestinations: 'egress.destinations',
  lugExposure: 'lug.exposure',
  disabledDecoderFamilies: 'normalization.disabled_decoder_families',
  sourceFormatMap: 'normalization.source_format_map',
  socNarrativeModelRef: 'soc_narrative.model_ref',
} as const;
type SectionName = keyof typeof SECTION_KEYS;

const SECTION_TITLES: Readonly<Record<SectionName, string>> = {
  dualControl: 'Dual control',
  egressDestinations: 'Egress destinations',
  lugExposure: 'LUG exposure',
  disabledDecoderFamilies: 'Disabled decoder families',
  sourceFormatMap: 'Source-format overrides',
  socNarrativeModelRef: 'Narrative model',
};

type Commit = (section: SectionName, patch: SectionPatch) => void;

function Submit({
  label,
  disabled,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <button type="submit" className="fcx-btn" disabled={disabled}>
      Commit {label}
    </button>
  );
}

function DualControlForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [set, setSet] = useState<ReadonlySet<string>>(new Set(values.dualControl));
  return (
    <form
      aria-label="Dual control"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit('dualControl', { dualControl: ADMIN_CAPABILITIES.filter((c) => set.has(c)) });
      }}
    >
      <p className="fcx-settings__hint">
        The capabilities whose operations require two people. Adding <code>tenant-config</code> puts
        these settings themselves under dual control: after it, changes are proposed and approved.
      </p>
      {ADMIN_CAPABILITIES.map((c) => (
        <label key={c}>
          <input
            type="checkbox"
            checked={set.has(c)}
            onChange={(e) => {
              const next = new Set(set);
              if (e.target.checked) next.add(c);
              else next.delete(c);
              setSet(next);
            }}
          />{' '}
          {c}
        </label>
      ))}
      <Submit label="dual control" />
    </form>
  );
}

function EgressForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [rows, setRows] = useState(values.egressDestinations.map((e) => ({ ...e })));
  const valid = rows.every((r) => r.id.trim() !== '');
  return (
    <form
      aria-label="Egress destinations"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onCommit('egressDestinations', { egressDestinations: rows });
      }}
    >
      <p className="fcx-settings__hint">
        The registered cognition egress destinations and the highest classification each may carry.
      </p>
      {rows.map((r, i) => (
        <div key={`egress-${String(i)}`} className="fcx-settings__row">
          <input
            type="text"
            aria-label={`Destination ${String(i + 1)} id`}
            value={r.id}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))
            }
          />
          <select
            aria-label={`Destination ${String(i + 1)} ceiling`}
            value={r.ceiling}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, ceiling: e.target.value } : x)))
            }
          >
            {CLASSIFICATION_TAGS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="fcx-btn"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="fcx-btn"
        onClick={() => setRows([...rows, { id: '', ceiling: 'unclassified' }])}
      >
        Add destination
      </button>{' '}
      <Submit label="egress destinations" disabled={!valid} />
    </form>
  );
}

const LUG_NUMBERS = [
  ['maxAccountsPerNamespace', 'Max accounts per namespace'],
  ['maxGroupsPerNamespace', 'Max groups per namespace'],
  ['maxSessionsPerDevice', 'Max sessions per device'],
  ['lastSeenBucketHours', 'Last-seen bucket (hours)'],
  ['bindingConfirmThresholdPermille', 'Binding confirm threshold (permille)'],
  ['snapshotCadenceHours', 'Snapshot cadence (hours)'],
] as const;

function LugForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [lug, setLug] = useState({ ...values.lugExposure });
  const valid = LUG_NUMBERS.every(([k]) => Number.isInteger(lug[k]) && lug[k] >= 0);
  return (
    <form
      aria-label="LUG exposure"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onCommit('lugExposure', { lugExposure: lug });
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={lug.enabled}
          onChange={(e) => setLug({ ...lug, enabled: e.target.checked })}
        />{' '}
        LUG ingest enabled
      </label>
      <label>
        <input
          type="checkbox"
          checked={lug.resolutionEnabled}
          onChange={(e) => setLug({ ...lug, resolutionEnabled: e.target.checked })}
        />{' '}
        Identity resolution enabled
      </label>
      {LUG_NUMBERS.map(([k, label]) => (
        <label key={k}>
          {label}
          <input
            type="number"
            min={0}
            value={String(lug[k])}
            onChange={(e) => setLug({ ...lug, [k]: Number.parseInt(e.target.value, 10) })}
          />
        </label>
      ))}
      <Submit label="LUG exposure" disabled={!valid} />
    </form>
  );
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

function FamiliesForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [text, setText] = useState(values.disabledDecoderFamilies.join('\n'));
  return (
    <form
      aria-label="Disabled decoder families"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit('disabledDecoderFamilies', { disabledDecoderFamilies: linesOf(text) });
      }}
    >
      <label>
        One decoder family per line; the engine refuses a family it does not have.
        <textarea
          aria-label="Disabled decoder families"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Submit label="decoder families" />
    </form>
  );
}

function SourceMapForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [text, setText] = useState(
    values.sourceFormatMap.map((m) => `${m.source}=${m.format}`).join('\n'),
  );
  const parsed = linesOf(text).map((l) => {
    const at = l.indexOf('=');
    return at <= 0 || at === l.length - 1
      ? null
      : { source: l.slice(0, at).trim(), format: l.slice(at + 1).trim() };
  });
  const valid = parsed.every((p) => p !== null);
  return (
    <form
      aria-label="Source-format overrides"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onCommit('sourceFormatMap', { sourceFormatMap: parsed.filter((p) => p !== null) });
      }}
    >
      <label>
        One <code>source=format</code> per line; the engine refuses a format it does not have.
        <textarea
          aria-label="Source-format overrides"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {valid ? null : (
        <p className="fcx-settings__hint">Every line needs a source and a format around one =.</p>
      )}
      <Submit label="source-format overrides" disabled={!valid} />
    </form>
  );
}

function ModelRefForm({
  values,
  onCommit,
}: {
  readonly values: SectionValues;
  readonly onCommit: Commit;
}): ReactElement {
  const [ref, setRef] = useState(values.socNarrativeModelRef ?? '');
  return (
    <form
      aria-label="Narrative model"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit('socNarrativeModelRef', { socNarrativeModelRef: ref.trim() });
      }}
    >
      <label>
        The registered model that writes verdict narratives, as <code>id@version</code>; empty
        unbinds it. The engine refuses a model that is not registered.
        <input
          type="text"
          aria-label="Narrative model ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
      </label>
      <Submit label="narrative model" />
    </form>
  );
}

const FORMS: Readonly<
  Record<SectionName, (p: { values: SectionValues; onCommit: Commit }) => ReactElement>
> = {
  dualControl: DualControlForm,
  egressDestinations: EgressForm,
  lugExposure: LugForm,
  disabledDecoderFamilies: FamiliesForm,
  sourceFormatMap: SourceMapForm,
  socNarrativeModelRef: ModelRefForm,
};

/** The section forms for every section the engine marks editable; they propose under dual control. */
export function SectionForms({ view }: { readonly view: SettingsView }): ReactElement | null {
  const propose = view.dualControlRequired;
  const commit = useGovernedChange(propose);
  const [pending, setPending] = useState<{ section: SectionName; patch: SectionPatch } | null>(
    null,
  );
  const values = view.sectionValues;
  if (values === null) {
    return null;
  }
  const editable = new Set(view.rows.filter((r) => r.editable).map((r) => r.key));
  const names = (Object.keys(SECTION_KEYS) as SectionName[]).filter((n) =>
    editable.has(SECTION_KEYS[n]),
  );
  if (names.length === 0) {
    return null;
  }
  return (
    <section
      className="fcx-settings__sections"
      aria-label="Section settings"
      data-testid="settings-sections"
    >
      <h3 className="fcx-reports__heading">Section settings</h3>
      {names.map((name) => {
        const Form = FORMS[name];
        return (
          <details
            key={name}
            className="fcx-settings__section"
            data-testid={`settings-section-${name}`}
          >
            <summary>{SECTION_TITLES[name]}</summary>
            <Form
              // Re-mount on a new committed version so a form starts from what is committed.
              key={`${name}-${String(view.version)}`}
              values={values}
              onCommit={(section, patch) => setPending({ section, patch })}
            />
          </details>
        );
      })}
      {commit.isPending ? <LoadingState label={propose ? 'Proposing' : 'Committing'} /> : null}
      {commit.isError ? (
        <ErrorState title="The change could not be sent" onRetry={() => commit.reset()} />
      ) : null}
      {commit.isSuccess ? <ChangeReceipt result={commit.data} /> : null}
      <ConfirmDialog
        open={pending !== null}
        title={
          pending === null
            ? ''
            : `${propose ? 'Propose' : 'Commit'} ${SECTION_TITLES[pending.section]}?`
        }
        description={
          propose
            ? 'Tenant-config is under dual control. The engine validates this section and records it as a proposal under your principal; a different Admin must approve it before it applies.'
            : 'The engine validates this section and commits it to the governed configuration under your principal. The change applies live.'
        }
        confirmLabel={propose ? 'Propose' : 'Commit'}
        tone="critical"
        onConfirm={() => {
          if (pending !== null) commit.mutate({ edits: [], sections: pending.patch });
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
