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
// The Configure tab is READ-ONLY here: it shows the selected zone's own vs effective posture and names the
// ancestor that tightened it (the `vtz.detail` binding, live since V2.2). Authoring -- the editable
// per-domain form, the floor lock, the effective-posture preview, draft/publish -- is V2.5.

import { useMemo, useState, type ReactElement } from 'react';
import { Badge, KpiCard, TabStrip, VtzZoneCard, type BadgeVariant } from '@forge/design';
import {
  VTZ_OBJECT_DOMAINS,
  type DomainPosture,
  type RiskLevel,
  type VtzArchetype,
  type VtzZone,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useVtzDetail, useVtzRiskBands, useVtzTree } from './useVtzTree.js';

/**
 * The archetype badge for a zone (`zone_type`). The label is the archetype itself -- this is a
 * CLASSIFICATION, not a judgement, so the variant conveys the kind of zone rather than "good/bad":
 * `isolation` reuses the quarantine token (that is exactly what it is), `public` is the exposed boundary
 * (caution), `trusted` is informational, and `standard` is the unremarkable default.
 */
const ARCHETYPE_BADGE: Readonly<Record<VtzArchetype, { label: string; variant: BadgeVariant }>> = {
  standard: { label: 'Standard', variant: 'neutral' },
  trusted: { label: 'Trusted', variant: 'info' },
  isolation: { label: 'Isolation', variant: 'quarantine' },
  public: { label: 'Public', variant: 'caution' },
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

/** Order the postures for display by the fixed domain order, so every zone reads the same way. */
function orderPostures(postures: readonly DomainPosture[]): readonly DomainPosture[] {
  const rank = new Map(VTZ_OBJECT_DOMAINS.map((domain, index) => [domain, index]));
  return [...postures].sort((a, b) => (rank.get(a.domain) ?? 0) - (rank.get(b.domain) ?? 0));
}

/** The human label for a posture value. */
function postureLabel(posture: DomainPosture['posture']): string {
  return posture === 'deny' ? 'Deny' : 'Permit, deny risky';
}

/** The read-only configuration panel for the selected zone: own vs effective posture + contributors. */
function ZoneConfiguration({ zoneId }: { zoneId: string }): ReactElement {
  const detail = useVtzDetail(zoneId);
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
  const zone = detail.data.zone;
  if (zone === null) {
    return (
      <EmptyState
        title="That zone no longer exists"
        hint={`The engine holds no zone named ${zoneId}. It may have been deleted or re-scoped.`}
      />
    );
  }
  const own = new Map(zone.ownPostures.map((p) => [p.domain, p]));
  return (
    <div className="fcx-vtz-config">
      <dl className="fcx-vtz-config__settings">
        <div>
          <dt>Session duration</dt>
          <dd>{zone.reauthIntervalHours} hour(s)</dd>
        </div>
        <div>
          <dt>Micro-segmentation</dt>
          <dd>{zone.microSegmentation ? 'On' : 'Off'}</dd>
        </div>
        <div>
          <dt>Telemetry</dt>
          <dd>{zone.telemetry}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{zone.lifecycle}</dd>
        </div>
      </dl>

      <p className="fcx-vtz-config__note">
        {detail.data.ancestors.length > 0
          ? `Effective posture composes this zone with ${detail.data.ancestors
              .map((a) => a.name)
              .join(', ')}. Inheritance only tightens: an ancestor's deny always wins.`
          : 'This is a root zone, so its effective posture is its own.'}
      </p>

      <table className="fcx-vtz-postures">
        <caption>Per-domain posture: what this zone set, and what actually applies</caption>
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Own</th>
            <th scope="col">Effective</th>
          </tr>
        </thead>
        <tbody>
          {orderPostures(zone.effectivePostures).map((effective) => {
            const ownPosture = own.get(effective.domain);
            const tightened = ownPosture !== undefined && ownPosture.posture !== effective.posture;
            return (
              <tr key={effective.domain}>
                <th scope="row">
                  {effective.domain}
                  {/* The engine flags the read-only catastrophic floor; the Console never decides it. */}
                  {effective.floor ? <Badge variant="critical">Floor</Badge> : null}
                </th>
                <td>{ownPosture === undefined ? '--' : postureLabel(ownPosture.posture)}</td>
                <td>
                  {postureLabel(effective.posture)}
                  {tightened ? <Badge variant="info">Inherited</Badge> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="fcx-vtz-config__note" role="note">
        Editing a zone lands with the authoring form; this view is read-only.
      </p>
    </div>
  );
}

/** The Virtual Trust Zones surface: the Active grid + the read-only zone configuration + honest states. */
export function VtzSurface(): ReactElement {
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
                  : 'The engine holds no trust zone for this tenant.'
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
                    draft={zone.lifecycle === 'draft'}
                    subZoneCount={zone.subZoneCount}
                    memberCount={{ unavailable: MEMBERS_UNAVAILABLE }}
                    policyCount={{ unavailable: POLICIES_UNAVAILABLE }}
                    selected={selectedId === zone.id}
                    onOpen={() => {
                      setSelectedId(zone.id);
                      setTab('configure');
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : selected === undefined ? (
        <EmptyState
          title="Select a zone to configure"
          hint="Pick a zone on the Active tab to see the posture it set and the posture that applies."
        />
      ) : (
        <div className="fcx-vtz-detail" aria-label={`Configuration for ${selected.name}`}>
          <h3 className="fcx-vtz-detail__title">{selected.name}</h3>
          <ZoneConfiguration zoneId={selected.id} />
        </div>
      )}
    </section>
  );
}
