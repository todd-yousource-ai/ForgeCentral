// apps/bff/src/engine/entity-detail.ts -- the entity-drawer detail resolver (IP-CONSOLE-12 DR.3).
//
// Produces the aggregated drawer `EntityDetailView` from the LIVE engine reads, brokered through the
// OperatorEngine (so every read runs as the operator, under the peer's Delegation grant). The section
// fan-out uses TOLERANT parallelism: a failed section degrades to `error` for that section, never the
// whole drawer (TRD-CONSOLE-12 Section 5). Header + info come from LIST_AGENTS (the agent directory);
// recent decisions from ENTITY_DECISIONS; capabilities from the `agent_capabilities` virtual relation
// (crdb VR.3, the AIG tools/authority/delegation edges). Zones / effective policies remain cross-repo
// deferrals (Forge, no queryable store in crdb) and resolve to an honest `pending` state -- never a
// fabricated section (INV-CONSOLE-DRAWER-REAL).

import type {
  AgentCapabilityRow,
  CapabilitiesView,
  DecisionStatus,
  EntityDetailView,
  EntityInfoView,
  EntityRef,
  EntityStatus,
  HeaderView,
  RecentDecisionRow,
  RecentDecisionsView,
  SectionState,
  WireAgentRecord,
  WireDecisionRow,
  WireQueryRows,
  WireValue,
} from '@forge/contracts';
import { decisionId } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** Map the engine agent status string to the typed `EntityStatus` (unknown for an unrecognized value). */
function toEntityStatus(status: string): EntityStatus {
  return status === 'active' || status === 'suspended' || status === 'compromised'
    ? status
    : 'unknown';
}

/** The value of a record attribute by key, or undefined. */
function attribute(record: WireAgentRecord, key: string): string | undefined {
  return record.attributes.find(([name]) => name === key)?.[1];
}

function toHeader(record: WireAgentRecord): HeaderView {
  return {
    displayName: record.agent_id,
    kindLabel: 'Agent',
    status: toEntityStatus(record.status),
  };
}

function toInfo(record: WireAgentRecord): EntityInfoView {
  const role = attribute(record, 'role');
  const clearance = attribute(record, 'clearance');
  // The remaining attributes (anything but role/clearance, e.g. the runtime id) become key=value tags.
  const tags = record.attributes
    .filter(([name]) => name !== 'role' && name !== 'clearance')
    .map(([name, value]) => `${name}=${value}`);
  return {
    ...(role !== undefined ? { role } : {}),
    ...(clearance !== undefined ? { clearance } : {}),
    enrolledAt: record.enrolled_at,
    tags,
  };
}

/** Classify a decision's advisory action into the semantic badge status. */
function toDecisionStatus(action: string): DecisionStatus {
  const a = action.toLowerCase();
  if (a.includes('deny') || a.includes('quarantine') || a.includes('block')) return 'denied';
  if (a.includes('flag') || a.includes('alert') || a.includes('monitor')) return 'flagged';
  if (a.includes('pass')) return 'pass';
  return 'success';
}

function toDecisionRow(row: WireDecisionRow): RecentDecisionRow {
  return {
    decisionId: decisionId(row.decision_id),
    ruleId: row.rule_id,
    summary: row.finding,
    outcome: row.recommended_action,
    status: toDecisionStatus(row.recommended_action),
    // The engine carries created_at in unix SECONDS; the view model is unix millis.
    at: row.created_at * 1000,
  };
}

/** A cross-repo deferral section (the data has no queryable store in crdb yet). */
function pending(owningRepo: string, gatingTask: string): SectionState<never> {
  return { status: 'pending', owningRepo, gatingTask };
}

/** The Text payload of a named cell in a `WireQueryRows` row, or undefined (a non-Text/absent cell). */
function textCell(
  row: ReadonlyArray<readonly [string, WireValue]>,
  name: string,
): string | undefined {
  const value = row.find(([cellName]) => cellName === name)?.[1];
  return value && 'Text' in value ? value.Text : undefined;
}

/** Map an AIG capability relation tag to its drawer surface label (the category the row belongs to). */
function capabilitySurface(relation: string): string {
  switch (relation) {
    case 'USES_TOOL':
      return 'tools';
    case 'GRANTS_AUTHORITY':
      return 'authority';
    case 'DELEGATES_TO':
      return 'delegation';
    default:
      return relation.toLowerCase();
  }
}

/**
 * Map one `agent_capabilities` row (`relation`, `target`) to a capability row, or null for a malformed
 * row (a missing/non-Text cell -- dropped, never fabricated).
 */
function toCapabilityRow(
  row: ReadonlyArray<readonly [string, WireValue]>,
): AgentCapabilityRow | null {
  const relation = textCell(row, 'relation');
  const target = textCell(row, 'target');
  if (relation === undefined || target === undefined) return null;
  return { name: target, surface: capabilitySurface(relation) };
}

/** Project the `agent_capabilities` read into its capability rows (malformed rows dropped). */
function toCapabilityRows(rows: WireQueryRows): AgentCapabilityRow[] {
  return rows.rows.map(toCapabilityRow).filter((row): row is AgentCapabilityRow => row !== null);
}

/**
 * Resolve the aggregated drawer detail for `ref`, brokered on behalf of `principal`. Tolerant fan-out:
 * each section resolves independently and degrades to `error`/`empty`/`pending` without failing the whole
 * drawer. No fabricated section.
 */
export async function resolveEntityDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  ref: EntityRef,
  opts?: EngineCallOptions,
): Promise<EntityDetailView> {
  const [directory, decisions, capabilities] = await Promise.allSettled([
    engine.listAgents(principal, { request_id: 0 }, opts),
    // ENTITY_DECISIONS is indexed by the engine EntityType (host/process/...); the entity kind is passed
    // opaquely, and the engine returns an honest empty result for a kind it does not index (e.g. an agent
    // principal, until ER.2b adds agent-scoped decisions) -- never a fabricated row.
    engine.entityDecisions(
      principal,
      { request_id: 0, entity_type: ref.kind, entity_value: ref.id, limit: 50 },
      opts,
    ),
    // The agent's AIG capability edges via the `agent_capabilities` virtual relation (crdb VR.3). The
    // read runs for every entity; the section is gated to agents below (an entity absent from the agent
    // directory is `not-applicable`, not empty).
    engine.querySubmit(
      principal,
      {
        request_id: 0,
        text: 'FIND agent_capabilities WHERE agent_id = $a RETURN relation, target',
        params: [['a', { Text: ref.id }]],
      },
      opts,
    ),
  ]);

  const record =
    directory.status === 'fulfilled'
      ? directory.value.agents.find((agent) => agent.agent_id === ref.id)
      : undefined;

  let header: SectionState<HeaderView>;
  let info: SectionState<EntityInfoView>;
  if (directory.status === 'fulfilled') {
    header = record ? { status: 'ok', data: toHeader(record) } : { status: 'empty' };
    info = record ? { status: 'ok', data: toInfo(record) } : { status: 'empty' };
  } else {
    header = { status: 'error', message: 'agent directory unavailable' };
    info = { status: 'error', message: 'agent directory unavailable' };
  }

  // Capabilities apply only to an agent: a non-agent entity (not in the directory) is `not-applicable`;
  // a directory failure is `error`; otherwise the read projects to rows (empty when the agent holds none).
  let capabilitiesSection: SectionState<CapabilitiesView>;
  if (directory.status === 'rejected') {
    capabilitiesSection = { status: 'error', message: 'agent directory unavailable' };
  } else if (!record) {
    capabilitiesSection = { status: 'not-applicable' };
  } else if (capabilities.status === 'rejected') {
    capabilitiesSection = { status: 'error', message: 'capabilities unavailable' };
  } else {
    const rows = toCapabilityRows(capabilities.value);
    capabilitiesSection =
      rows.length === 0
        ? { status: 'empty' }
        : { status: 'ok', data: { kind: 'capabilities', source: 'aig-graph', capabilities: rows } };
  }

  let recentDecisions: SectionState<RecentDecisionsView>;
  if (decisions.status === 'fulfilled') {
    recentDecisions =
      decisions.value.decisions.length === 0
        ? { status: 'empty' }
        : { status: 'ok', data: { decisions: decisions.value.decisions.map(toDecisionRow) } };
  } else {
    recentDecisions = { status: 'error', message: 'decisions unavailable' };
  }

  return {
    ref,
    header,
    info,
    zones: pending('forge', 'Forge VTZ membership store (not queryable in crdb)'),
    capabilities: capabilitiesSection,
    effectivePolicies: pending(
      'forge',
      'Forge effective-policy resolution (not queryable in crdb)',
    ),
    recentDecisions,
  };
}
