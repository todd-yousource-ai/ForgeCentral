// apps/bff/src/engine/entity-detail.ts -- the entity-drawer detail resolver (IP-CONSOLE-12 DR.3).
//
// Produces the aggregated drawer `EntityDetailView` from the LIVE engine reads, brokered through the
// OperatorEngine (so every read runs as the operator, under the peer's Delegation grant). The section
// fan-out uses TOLERANT parallelism: a failed section degrades to `error` for that section, never the
// whole drawer (TRD-CONSOLE-12 Section 5). Header + info come from LIST_AGENTS (the agent directory);
// recent decisions from ENTITY_DECISIONS. Zones / effective policies / capabilities are cross-repo
// deferrals (Forge / Torch, no queryable store in crdb) and resolve to an honest `pending` state -- never
// a fabricated section (INV-CONSOLE-DRAWER-REAL).

import type {
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
  const [directory, decisions] = await Promise.allSettled([
    engine.listAgents(principal, { request_id: 0 }, opts),
    // ENTITY_DECISIONS is indexed by the engine EntityType (host/process/...); the entity kind is passed
    // opaquely, and the engine returns an honest empty result for a kind it does not index (e.g. an agent
    // principal, until ER.2b adds agent-scoped decisions) -- never a fabricated row.
    engine.entityDecisions(
      principal,
      { request_id: 0, entity_type: ref.kind, entity_value: ref.id, limit: 50 },
      opts,
    ),
  ]);

  let header: SectionState<HeaderView>;
  let info: SectionState<EntityInfoView>;
  if (directory.status === 'fulfilled') {
    const record = directory.value.agents.find((agent) => agent.agent_id === ref.id);
    header = record ? { status: 'ok', data: toHeader(record) } : { status: 'empty' };
    info = record ? { status: 'ok', data: toInfo(record) } : { status: 'empty' };
  } else {
    header = { status: 'error', message: 'agent directory unavailable' };
    info = { status: 'error', message: 'agent directory unavailable' };
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
    capabilities: pending('torch', 'torch-inspect Construction Report read binding'),
    effectivePolicies: pending(
      'forge',
      'Forge effective-policy resolution (not queryable in crdb)',
    ),
    recentDecisions,
  };
}
