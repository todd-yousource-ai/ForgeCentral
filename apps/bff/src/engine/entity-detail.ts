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
  EffectivePoliciesView,
  EntityDetailView,
  EntityInfoView,
  EntityRef,
  EntityStatus,
  HeaderView,
  PrincipalRow,
  RecentDecisionRow,
  RecentDecisionsView,
  SectionState,
  ZonesView,
  WireAgentRecord,
  WireDecisionRow,
  WireQueryRows,
  WireValue,
} from '@forge/contracts';
import { decisionId, objectKindLabel, toObjectDetail, toPrincipalRows } from '@forge/contracts';

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

/** The LUG principal's drawer header (UY.5): the engine tag as the kind label, the real lifecycle. */
function principalHeader(row: PrincipalRow): HeaderView {
  const kindLabel =
    row.kind === 'human' ? 'Human' : row.kind === 'service' ? 'Service Account' : 'AI Agent';
  const status: EntityStatus =
    row.status === 'active' || row.status === 'suspended' || row.status === 'compromised'
      ? row.status
      : row.status === 'revoked' || row.status === 'disabled'
        ? 'suspended'
        : 'unknown';
  return { displayName: row.username, kindLabel, status };
}

/**
 * The LUG principal's info section (UY.5): the identity facts the directory row carries -- origin,
 * namespace, groups, privileges, org/email where present -- as real key=value tags. `enrolledAt` is
 * the fact's first-seen instant. No trust field exists (INV-CONSOLE-USERS-REAL).
 */
function principalInfo(row: PrincipalRow): EntityInfoView {
  const tags = [
    `origin=${row.origin}`,
    `namespace=${row.namespace}`,
    ...(row.status === 'revoked' || row.status === 'disabled' ? [`lifecycle=${row.status}`] : []),
    ...(row.email === '' ? [] : [`email=${row.email}`]),
    ...(row.org === '' ? [] : [`org=${row.org}`]),
    ...row.groups.map((g) => `group=${g}`),
    ...row.privileges.map((v) => `privilege=${v}`),
    ...(row.subjectId === null ? [] : [`identity=${row.subjectId}`]),
  ];
  return { enrolledAt: row.firstSeen, tags };
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
export function toDecisionStatus(action: string): DecisionStatus {
  const a = action.toLowerCase();
  // The advisory posture tags grade by severity (crdb `posture_tag`): `escalate` (act now) is the most
  // severe, `candidate` warrants attention, `observe-only` is recorded/watched. A denial/quarantine verb
  // is likewise the most severe; a monitor/alert verb warrants attention; a pass verb is neutral.
  if (
    a.includes('escalate') ||
    a.includes('deny') ||
    a.includes('quarantine') ||
    a.includes('block')
  )
    return 'denied';
  if (a.includes('candidate') || a.includes('flag') || a.includes('alert') || a.includes('monitor'))
    return 'flagged';
  if (a.includes('observe') || a.includes('pass')) return 'pass';
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
 * Map one `construction_report` row (`surface`, `entry`) to a capability row, or null for a malformed /
 * entry-less row. The report's per-surface item (`entry`) is the capability name, tagged by its surface
 * (tools/skills/mcp_servers/models/prompts/capabilities/persistence/risk/identity/sbom) -- the same
 * {name, surface} shape as the AIG rows, so the drawer renders the richer source with no rework (CR.4). An
 * `Unknown` surface (empty `entry`) is dropped, never fabricated.
 */
function toConstructionRow(
  row: ReadonlyArray<readonly [string, WireValue]>,
): AgentCapabilityRow | null {
  const surface = textCell(row, 'surface');
  const entry = textCell(row, 'entry');
  if (surface === undefined || entry === undefined || entry === '') return null;
  return { name: entry, surface };
}

/** Project the `construction_report` read into capability rows (malformed / empty-entry rows dropped). */
function toConstructionRows(rows: WireQueryRows): AgentCapabilityRow[] {
  return rows.rows.map(toConstructionRow).filter((row): row is AgentCapabilityRow => row !== null);
}

/**
 * Resolve the aggregated drawer detail for `ref`, brokered on behalf of `principal`. Tolerant fan-out:
 * each section resolves independently and degrades to `error`/`empty`/`pending` without failing the whole
 * drawer. No fabricated section.
 */
/**
 * The object-ref drawer detail (O10.4): the named object + its READ-TIME resolved members, projected
 * to the shared drawer sections. Header = name + kind label; info = the selector, lifecycle, tags, and
 * each resolved member as a tag (empty when nothing matches -- declarative); governing policies are
 * PENDING (the Policy epic, TRD-CONSOLE-05); zones/capabilities/decisions are not-applicable to a noun.
 */
async function resolveObjectEntity(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  ref: EntityRef,
  opts?: EngineCallOptions,
): Promise<EntityDetailView> {
  let detail;
  try {
    detail = toObjectDetail(
      await engine.objectDetail(principal, { request_id: 0, name: ref.id }, opts),
    );
  } catch {
    detail = null;
  }
  const pendingPolicies: SectionState<EffectivePoliciesView> = {
    status: 'pending',
    owningRepo: 'crdb',
    gatingTask: 'TRD-CONSOLE-05 Policy surface (object -> governing-policy resolution)',
  };
  const base = {
    ref,
    zones: { status: 'not-applicable' } as SectionState<ZonesView>,
    capabilities: { status: 'not-applicable' } as SectionState<CapabilitiesView>,
    effectivePolicies: pendingPolicies,
    recentDecisions: { status: 'not-applicable' } as SectionState<RecentDecisionsView>,
  };
  if (detail === null) {
    return {
      ...base,
      header: { status: 'error', message: 'object registry unavailable' },
      info: { status: 'error', message: 'object registry unavailable' },
    };
  }
  const object = detail.object;
  if (object === null) {
    return { ...base, header: { status: 'empty' }, info: { status: 'empty' } };
  }
  const selectorLabel =
    object.selectorKind === 'cidr'
      ? 'CIDR'
      : object.selectorKind === 'group_ref'
        ? 'group'
        : object.selectorKind;
  const tags = [
    `selector=${selectorLabel} ${object.selectorValue}`,
    `lifecycle=${object.lifecycle}`,
    ...object.tags.map((t) => `tag=${t}`),
    ...object.attributes.map((a) => `attribute=${a}`),
    ...detail.members.map((m) => `member=${m}`),
  ];
  return {
    ...base,
    header: {
      status: 'ok',
      data: {
        displayName: object.name,
        kindLabel: objectKindLabel(object.kind),
        status: 'unknown',
      },
    },
    info: { status: 'ok', data: { enrolledAt: 0, tags } },
  };
}

export async function resolveEntityDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  ref: EntityRef,
  opts?: EngineCallOptions,
): Promise<EntityDetailView> {
  // O10.4: an object ref resolves from the named-object registry (OBJECT_DETAIL): header + info
  // (selector + read-time members + tags + lifecycle), governing policies PENDING (the Policy epic),
  // and the agent-only / decision sections not-applicable. An object is a noun -- no posture here.
  if (ref.kind === 'object') {
    return resolveObjectEntity(engine, principal, ref, opts);
  }
  const [directory, principals, decisions, capabilities, construction] = await Promise.allSettled([
    engine.listAgents(principal, { request_id: 0 }, opts),
    // The LUG principal directory (LIST_PRINCIPALS, ER.6): a `principal` ref that is not an agent
    // resolves its identity here (UY.5) -- observed accounts and provisioned records alike.
    engine.listPrincipals(principal, { request_id: 0 }, opts),
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
    // The agent's signed Construction Report surfaces via the `construction_report` virtual relation
    // (crdb CR.4): the 10-surface decomposition Torch shipped (tools/skills/mcp/models/prompts/...). The
    // RICHER capability source -- preferred over the AIG edges when present, same {name, surface} shape so
    // the drawer upgrades with no rework (INV-CONSOLE-DRAWER-REAL; never a fabricated surface).
    engine.querySubmit(
      principal,
      {
        request_id: 0,
        text: 'FIND construction_report WHERE agent_id = $a RETURN surface, entry',
        params: [['a', { Text: ref.id }]],
      },
      opts,
    ),
  ]);

  const record =
    directory.status === 'fulfilled'
      ? directory.value.agents.find((agent) => agent.agent_id === ref.id)
      : undefined;
  // The LUG identity, when the ref names a principal row (matched by id; the drawer trigger passes
  // the row's engine id). Fail-closed: an un-narrowable directory collapses to null and the header
  // degrades to error, never a guessed identity.
  const principalRows =
    principals.status === 'fulfilled' ? toPrincipalRows(principals.value) : null;
  const principalRow = principalRows?.find((row) => row.principalId === ref.id);

  let header: SectionState<HeaderView>;
  let info: SectionState<EntityInfoView>;
  if (record) {
    header = { status: 'ok', data: toHeader(record) };
    info = { status: 'ok', data: toInfo(record) };
  } else if (principalRow) {
    header = { status: 'ok', data: principalHeader(principalRow) };
    info = { status: 'ok', data: principalInfo(principalRow) };
  } else if (directory.status === 'fulfilled' && principals.status === 'fulfilled') {
    header = { status: 'empty' };
    info = { status: 'empty' };
  } else {
    header = { status: 'error', message: 'entity directory unavailable' };
    info = { status: 'error', message: 'entity directory unavailable' };
  }

  // Capabilities apply only to an agent: a non-agent entity (not in the directory) is `not-applicable`;
  // a directory failure is `error`; otherwise the read projects to rows (empty when the agent holds none).
  let capabilitiesSection: SectionState<CapabilitiesView>;
  if (directory.status === 'rejected') {
    capabilitiesSection = { status: 'error', message: 'agent directory unavailable' };
  } else if (!record) {
    capabilitiesSection = { status: 'not-applicable' };
  } else {
    // Prefer the signed Construction Report (CR.4, the richer 10-surface decomposition Torch shipped) when
    // it resolved with rows; else fall back to the AIG capability edges (VR.3); else empty. The two sources
    // share the {name, surface} row shape, so the drawer renders either with no rework. Never fabricated.
    const constructionRows =
      construction.status === 'fulfilled' ? toConstructionRows(construction.value) : [];
    if (constructionRows.length > 0) {
      capabilitiesSection = {
        status: 'ok',
        data: {
          kind: 'capabilities',
          source: 'construction-report',
          capabilities: constructionRows,
        },
      };
    } else if (capabilities.status === 'rejected') {
      capabilitiesSection = { status: 'error', message: 'capabilities unavailable' };
    } else {
      const rows = toCapabilityRows(capabilities.value);
      capabilitiesSection =
        rows.length === 0
          ? { status: 'empty' }
          : {
              status: 'ok',
              data: { kind: 'capabilities', source: 'aig-graph', capabilities: rows },
            };
    }
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
