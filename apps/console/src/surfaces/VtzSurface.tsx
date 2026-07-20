// apps/console/src/surfaces/VtzSurface.tsx -- the Virtual Trust Zones surface (IP-CONSOLE-02 V2.4).
//
// The first governance surface: the operator sees every trust zone the platform holds, its posture, and
// its boundary. The `useVtzTree` hook reads the real zones from the BFF (GET /api/vtz/tree -> crdb
// VTZ_TREE, the system of record); this surface renders them as the Active VTZs grid and owns the honest
// states.
//
// NO TRUST SCORE (INV-CONSOLE-VTZ-REAL). The mockup's per-card trust gauge and "Avg Trust" KPI are gone:
// the substrate carries no score, so a zone's health reads as its ARCHETYPE badge plus the
// detection-driven RISK band joined from the Overview graph by zone id. A zone no decision has touched
// carries no band, and the card says nothing rather than showing a fabricated green.
//
// SEARCH IS A VIEW, NOT A FILTER. The Logs surface never filters client-side because its engine read
// takes the predicate. `VTZ_TREE` takes only a bound -- the tenant's zones are a small, complete,
// already-bounded set -- so the search box narrows what is DISPLAYED over the whole real tree, the same
// way the Overview's hover-to-filter is a view over the already-real graph. The count of matches is always
// stated against the true total so a narrowed grid is never mistaken for the whole store.
//
// AUTHORING (V2.5). The Configure tab is the editor: settings, the per-domain posture matrix with the
// engine-flagged floor rows locked, and a live effective-posture preview composed against the PARENT
// zone's real effective postures (a second `vtz.detail` read, so the preview is exact rather than
// guessed). Save / Re-scope / Delete are three separate confirm-gated audited acts, because the engine
// models them as three separate verbs. Every commit invalidates the tree, so the grid re-reads the system
// of record instead of trusting the form.

import { useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, KpiCard, TabStrip, VtzZoneCard, type BadgeVariant } from '@forge/design';
import type { RiskLevel, VtzArchetype, VtzSpecInput, VtzZone } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { VtzEditor, type EditorFailure } from './VtzEditor.js';
import { useVtzMutation, VtzCommandError } from './useVtzMutation.js';
import { useVtzDetail, useVtzRiskBands, useVtzTree } from './useVtzTree.js';

/**
 * The archetype badge for a zone (`zone_type`). A VTZ is the policy EDGE, so the archetype names which
 * KIND of policy the zone is meant to receive -- a classification, not a judgement. The variant conveys
 * that kind: `quarantine` and `isolation` are the restrictive dispositions, `public` is the exposed
 * boundary, `observability` is informational (visibility first), `standard` the unremarkable default.
 */
const ARCHETYPE_BADGE: Readonly<Record<VtzArchetype, { label: string; variant: BadgeVariant }>> = {
  standard: { label: 'Standard', variant: 'neutral' },
  quarantine: { label: 'Quarantine', variant: 'quarantine' },
  isolation: { label: 'Isolation', variant: 'critical' },
  public: { label: 'Public', variant: 'caution' },
  observability: { label: 'Observability', variant: 'info' },
};

/** The risk band -> the card badge (the same vocabulary the Overview header uses, one meaning). */
const RISK_BADGE: Readonly<Record<RiskLevel, { label: string; variant: BadgeVariant }>> = {
  green: { label: 'Nominal', variant: 'good' },
  yellow: { label: 'Elevated', variant: 'caution' },
  red: { label: 'Critical', variant: 'critical' },
};

/** Why the member count is absent (shown on the card, so the gap is legible rather than mysterious). */
const MEMBERS_UNAVAILABLE = 'Zone membership is not stored by the engine yet.';

/** Why the policy count is absent. */
const POLICIES_UNAVAILABLE = 'Policies are not stored by the engine yet.';

/**
 * A zone is HIGH-SENSITIVITY when its effective posture denies a domain BEYOND the read-only catastrophic
 * floor. Every zone denies `governed-egress` and `execution` -- that is the floor every zone carries, so
 * counting it would make the KPI meaningless. What distinguishes a tightened zone is denying something
 * else, which is exactly what this counts. Derived from the real effective postures, never a label.
 */
export function isHighSensitivity(zone: VtzZone): boolean {
  return zone.effectivePostures.some((p) => p.posture === 'deny' && !p.floor);
}

/** How many of `zones` are high-sensitivity (the KPI). */
export function highSensitivityCount(zones: readonly VtzZone[]): number {
  return zones.filter(isHighSensitivity).length;
}

/**
 * The zones whose dotted name matches `search` (case-insensitive substring). A blank search matches every
 * zone. A display view over the already-real tree; see the surface header note.
 */
export function matchZones(zones: readonly VtzZone[], search: string): readonly VtzZone[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return zones;
  return zones.filter((z) => z.name.toLowerCase().includes(needle));
}

/** The typed failure of the last command, or null when it was not one the Console classified. */
function failureOf(error: Error | null): EditorFailure | null {
  if (error === null) return null;
  if (error instanceof VtzCommandError) {
    return { kind: error.failure, settingsCommitted: error.settingsCommitted };
  }
  return { kind: 'unavailable', settingsCommitted: false };
}

/**
 * The authoring container for one selected zone: reads the zone AND its parent (whose effective postures
 * are the exact inherited contribution the preview composes against), then renders the editor bound to the
 * audited commands.
 */
function ZoneAuthoring({
  zoneId,
  parents,
  onMoved,
  onDeleted,
}: {
  readonly zoneId: string;
  readonly parents: readonly VtzZone[];
  readonly onMoved: (newId: string) => void;
  readonly onDeleted: () => void;
}): ReactElement {
  const detail = useVtzDetail(zoneId);
  const zone = detail.data?.zone ?? null;
  const mutation = useVtzMutation();

  if (detail.isLoading) {
    return <LoadingState label="Loading the zone configuration" />;
  }
  if (detail.isError || detail.data === undefined) {
    return (
      <ErrorState
        title="Could not load the zone configuration."
        onRetry={() => void detail.refetch()}
      />
    );
  }
  if (zone === null) {
    return (
      <EmptyState
        title="That zone no longer exists"
        hint={`The engine holds no zone named ${zoneId}. It may have been deleted or re-scoped.`}
      />
    );
  }
  return (
    <VtzEditor
      // Remount on a zone change so the form initializes from the new zone with no state-sync effect.
      key={zone.id}
      mode="edit"
      zone={zone}
      parents={parents}
      busy={mutation.isPending}
      failure={failureOf(mutation.error)}
      onSubmit={(spec: VtzSpecInput, moveTo: string | null) =>
        mutation.mutate(
          { kind: 'save', id: zone.id, spec, moveTo },
          // A move lands the zone on a new id, so the surface follows it rather than holding a
          // selection the store no longer has.
          { onSuccess: (result) => onMoved(result.id) },
        )
      }
      onDelete={() => mutation.mutate({ kind: 'delete', id: zone.id }, { onSuccess: onDeleted })}
    />
  );
}

/** The create form: authors a zone, optionally nested under a parent chosen in the form. */
function ZoneCreate({
  parents,
  onCreated,
  onCancel,
}: {
  readonly parents: readonly VtzZone[];
  readonly onCreated: (id: string) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const mutation = useVtzMutation();
  return (
    <div className="fcx-vtz-create" aria-label="Create a trust zone">
      <VtzEditor
        mode="create"
        zone={null}
        parents={parents}
        busy={mutation.isPending}
        failure={failureOf(mutation.error)}
        onSubmit={(spec: VtzSpecInput) =>
          mutation.mutate({ kind: 'create', spec }, { onSuccess: (r) => onCreated(r.id) })
        }
        onCancel={onCancel}
      />
    </div>
  );
}

/** The Virtual Trust Zones surface: the Active grid + the read-only zone configuration + honest states. */
export function VtzSurface(): ReactElement {
  // A `?zone=` deep link is how the Overview's VTZ ring lands here (TRD-CONSOLE-02 acceptance). It seeds
  // the selection on first render; the operator's own clicks take over from there.
  const [params] = useSearchParams();
  const linkedZone = params.get('zone');
  const [tab, setTab] = useState(linkedZone !== null ? 'configure' : 'active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(linkedZone);
  const [creating, setCreating] = useState(false);

  const zonesQuery = useVtzTree();
  // The per-zone risk band is a JOIN over the already-live connectivity read (`vtz.riskBand`), not a new
  // engine op. A zone the graph does not carry simply has no band -- absent, never defaulted.
  const riskBands = useVtzRiskBands();
  const riskById = useMemo(() => {
    const map = new Map<string, RiskLevel>();
    for (const vtz of riskBands.data?.vtzs ?? []) map.set(vtz.id, vtz.risk.level);
    return map;
  }, [riskBands.data]);

  const zones = zonesQuery.data?.zones ?? [];
  const matches = useMemo(() => matchZones(zones, search), [zones, search]);
  const selected = selectedId !== null ? zones.find((z) => z.id === selectedId) : undefined;

  const showFullError = zonesQuery.isError && zonesQuery.data === undefined;

  return (
    <section className="fcx-surface" aria-labelledby="surface-vtz">
      <div className="fcx-surface__header">
        <h2 id="surface-vtz" className="fcx-surface__heading">
          Virtual Trust Zones
        </h2>
        {/* The engine reports when its zone scan hit the ceiling; the surface says so rather than
            presenting a prefix of the store as the whole (the same rule the Overview follows). */}
        {zonesQuery.data?.truncated === true ? <Badge variant="caution">Partial tree</Badge> : null}
        {/* Always available: an empty tenant MUST be able to author its first (root) zone. */}
        <button
          type="button"
          className="fcx-btn"
          disabled={zonesQuery.data === undefined}
          onClick={() => {
            setCreating(true);
            setTab('configure');
          }}
        >
          New zone
        </button>
      </div>

      <div className="fcx-vtz-kpis">
        <KpiCard label="Total VTZs" value={zonesQuery.data === undefined ? '--' : zones.length} />
        <KpiCard
          label="High-sensitivity zones"
          value={zonesQuery.data === undefined ? '--' : highSensitivityCount(zones)}
        />
      </div>

      <TabStrip
        tabs={[
          { id: 'active', label: 'Active' },
          { id: 'configure', label: 'Configure' },
        ]}
        activeId={tab}
        onChange={setTab}
        ariaLabel="Trust zone sections"
      />

      {tab === 'active' ? (
        <>
          <div className="fcx-vtz-controls" role="search">
            <label className="fcx-field">
              <span className="fcx-field__label">Search zones</span>
              <input
                type="search"
                className="fcx-input"
                value={search}
                placeholder="zone name"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {search.trim() !== '' && zonesQuery.data !== undefined ? (
              <p className="fcx-vtz-controls__count" aria-live="polite">
                Showing {matches.length} of {zones.length} zone(s)
              </p>
            ) : null}
          </div>

          {zonesQuery.isLoading ? (
            <LoadingState label="Loading trust zones" />
          ) : showFullError ? (
            <ErrorState
              title="Could not load the trust zones."
              onRetry={() => void zonesQuery.refetch()}
            />
          ) : matches.length === 0 ? (
            <EmptyState
              title={search.trim() !== '' ? 'No zones match' : 'No trust zones yet'}
              hint={
                search.trim() !== ''
                  ? `No zone name contains "${search.trim()}".`
                  : 'The engine holds no trust zone for this tenant yet. Use New zone to author the first one.'
              }
            />
          ) : (
            <div className="fcx-vtz-grid">
              {matches.map((zone) => {
                const risk = riskById.get(zone.id);
                return (
                  <VtzZoneCard
                    key={zone.id}
                    name={zone.name}
                    parent={zone.parent}
                    archetype={ARCHETYPE_BADGE[zone.zoneType]}
                    risk={risk !== undefined ? RISK_BADGE[risk] : null}
                    riskLevel={risk ?? null}
                    draft={zone.lifecycle === 'draft'}
                    subZoneCount={zone.subZoneCount}
                    memberCount={{ unavailable: MEMBERS_UNAVAILABLE }}
                    policyCount={{ unavailable: POLICIES_UNAVAILABLE }}
                    selected={selectedId === zone.id}
                    onOpen={() => {
                      setCreating(false);
                      setSelectedId(zone.id);
                      setTab('configure');
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : creating ? (
        <div className="fcx-vtz-detail">
          <h3 className="fcx-vtz-detail__title">New trust zone</h3>
          <ZoneCreate
            parents={zones}
            onCreated={(id) => {
              setCreating(false);
              setSelectedId(id);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : selected === undefined ? (
        <EmptyState
          title="Select a zone to configure"
          hint="Pick a zone on the Active tab to see the posture it set and the posture that applies."
        />
      ) : (
        <div className="fcx-vtz-detail" aria-label={`Configuration for ${selected.name}`}>
          <h3 className="fcx-vtz-detail__title">{selected.name}</h3>
          <ZoneAuthoring
            zoneId={selected.id}
            parents={zones}
            onMoved={(newId) => setSelectedId(newId)}
            onDeleted={() => {
              setSelectedId(null);
              setTab('active');
            }}
          />
        </div>
      )}
    </section>
  );
}
