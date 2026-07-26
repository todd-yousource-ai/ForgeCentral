// packages/wire/src/payload.ts -- typed WireRequest/WireReply CBOR payloads (F0.3b-2).
//
// The wire-DTO layer over the CBOR codec: it encodes a `WireRequest` (from @forge/contracts) to the CBOR
// bytes a frame carries, and decodes a frame payload back to a `WireReply`. The generated types are
// already in serde's externally-tagged shape, so decoding is a direct CBOR decode. Encoding needs one
// piece of wire-specific knowledge: the float-typed `WireValue` variants (`Float`, `Vector`) must be
// emitted as CBOR floats even when their value is integer-valued, which `wireValueToCbor` handles.

import type {
  OperatorDelegation,
  WireBundleCommit,
  WireBundleConvergenceQuery,
  WireGroupSetMembers,
  WireGroupWrite,
  WireIdamConnectors,
  WireIdamConfigure,
  WireIdamConnect,
  WireIdamSync,
  WireListGroups,
  WireListPrincipals,
  WireObjectCreate,
  WireObjectDelete,
  WireObjectDetailQuery,
  WireObjectEdit,
  WireObjectList,
  WireObjectSpec,
  WirePolicyCreate,
  WirePolicyDelete,
  WireDetectSummaryQuery,
  WirePolicyDetailQuery,
  WireSocIncidentDetailQuery,
  WireSocIncidentListQuery,
  WireSocNarrativeQuery,
  WirePolicyEdit,
  WirePolicyEffectiveQuery,
  WirePolicyListQuery,
  WirePolicyPublish,
  WirePolicyRule,
  WirePolicySpec,
  WireScopeMember,
  WireDomainPosture,
  WirePrincipalCreate,
  WirePrincipalEdit,
  WirePrincipalSetStatus,
  WirePrincipalSpec,
  WireConnectivityMembers,
  WireConnectivityQuery,
  WireEntityConnections,
  WireEntityDecisions,
  WireListAgents,
  WireLogExplain,
  WireLogExport,
  WireLogQuery,
  WireQuerySubmit,
  WireReply,
  WireRequest,
  WireValue,
  WireContain,
  WireVtzCreate,
  WireVtzDelete,
  WireVtzDetailQuery,
  WireVtzEdit,
  WireVtzRescope,
  WireVtzSpec,
  WireVtzTreeQuery,
} from '@forge/contracts';

import { CborFloat, decode, encode } from './cbor.js';

/** Map a WireValue to its CBOR-ready form, forcing the float-typed variants to encode as floats. */
export function wireValueToCbor(value: WireValue): unknown {
  if ('Float' in value) return { Float: new CborFloat(value.Float) };
  if ('Vector' in value) return { Vector: value.Vector.map((n) => new CborFloat(n)) };
  return value; // Bool / Int / Text / Bytes / Timestamp encode correctly as-is
}

/**
 * Emit the optional operator delegation onto a request's CBOR map, ONLY when present -- byte-identical to
 * a non-delegating client, matching crdb's `#[serde(default, skip_serializing_if = "Option::is_none")]`.
 * The engine honors it only under the peer's Delegation grant; the ids are hyphenated UUID strings.
 */
function applyOperator(
  out: Record<string, unknown>,
  operator: OperatorDelegation | null | undefined,
): void {
  if (operator != null) {
    out['operator'] = { principal: operator.principal, tenant: operator.tenant };
  }
}

function submitToCbor(submit: WireQuerySubmit): unknown {
  // Field order matches the Rust struct (request_id, text, params, operator) so the CBOR map is
  // byte-identical.
  const out: Record<string, unknown> = {
    request_id: submit.request_id,
    text: submit.text,
    params: submit.params.map(([key, value]) => [key, wireValueToCbor(value)]),
  };
  applyOperator(out, submit.operator);
  return out;
}

/** The agent-directory read (LIST_AGENTS, crdb ER.1). Fields in Rust struct order: request_id, operator. */
function listAgentsToCbor(request: WireListAgents): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The LUG principal/group directory reads (LIST_PRINCIPALS / LIST_GROUPS, crdb ER.6). Rust struct
 * order: request_id, then the optional operator (omitted when absent, byte-identical to a
 * non-delegating client).
 */
function directoryReadToCbor(request: WireListPrincipals | WireListGroups): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The enterprise-group write (GROUP_CREATE / GROUP_EDIT, crdb E3 LU.P). Rust struct order:
 * request_id, name, description, then the optional operator.
 */
function groupWriteToCbor(request: WireGroupWrite): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    name: request.name,
    description: request.description,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The local-principal spec (E3 `WirePrincipalSpec`). Rust struct order: username, subject_type,
 * then the optional email/org OMITTED when absent (byte-identical to a spec that never carried
 * them). NO trust field exists.
 */
function principalSpecToCbor(spec: WirePrincipalSpec): unknown {
  const out: Record<string, unknown> = {
    username: spec.username,
    subject_type: spec.subject_type,
  };
  if (spec.email !== undefined && spec.email !== null) out['email'] = spec.email;
  if (spec.org !== undefined && spec.org !== null) out['org'] = spec.org;
  return out;
}

/** PRINCIPAL_CREATE / PRINCIPAL_EDIT (crdb E3). Rust struct order: request_id, spec, operator. */
function principalWriteToCbor(request: WirePrincipalCreate | WirePrincipalEdit): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    spec: principalSpecToCbor(request.spec),
  };
  applyOperator(out, request.operator);
  return out;
}

/** PRINCIPAL_SET_STATUS (crdb E3). Rust struct order: request_id, username, status, operator. */
function principalSetStatusToCbor(request: WirePrincipalSetStatus): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    username: request.username,
    status: request.status,
  };
  applyOperator(out, request.operator);
  return out;
}

/** GROUP_SET_MEMBERS (crdb E3). Rust struct order: request_id, name, members, operator. */
function groupSetMembersToCbor(request: WireGroupSetMembers): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    name: request.name,
    members: request.members,
  };
  applyOperator(out, request.operator);
  return out;
}

/** OBJECT_LIST (crdb OB.3). Rust struct order: request_id, then the optional operator. */
function objectListToCbor(request: WireObjectList): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/** IDAM_CONNECTORS (crdb IA.8). Rust struct order: request_id, then the optional operator. */
function idamConnectorsToCbor(request: WireIdamConnectors): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/** IDAM_SYNC (crdb IA.8). Rust struct order: request_id, provider, then the optional operator. */
function idamSyncToCbor(request: WireIdamSync): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    provider: request.provider,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * IDAM_CONFIGURE (crdb IA.8). Rust struct order: request_id, provider, enabled, poll_interval_secs,
 * full_sync_cadence_hours, then the optional operator. Carries only runtime knobs; NO secret.
 */
function idamConfigureToCbor(request: WireIdamConfigure): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    provider: request.provider,
    enabled: request.enabled,
    poll_interval_secs: request.poll_interval_secs,
    full_sync_cadence_hours: request.full_sync_cadence_hours,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * IDAM_CONNECT (crdb IP-LUG-IDAM-CONNECT CO.1). Rust struct order: request_id, provider, domain,
 * client_id, audience, client_secret_ref, then the optional operator. The ref is a PATH, never a secret.
 */
function idamConnectToCbor(request: WireIdamConnect): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    provider: request.provider,
    domain: request.domain,
    client_id: request.client_id,
    audience: request.audience,
    client_secret_ref: request.client_secret_ref,
  };
  applyOperator(out, request.operator);
  return out;
}

/** OBJECT_DETAIL (crdb OB.3). Rust struct order: request_id, name, operator. */
function objectDetailToCbor(request: WireObjectDetailQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    name: request.name,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The named-object spec (crdb OB.4 `WireObjectSpec`). Rust struct order: name, kind, selector_kind,
 * selector_value, then the optional attributes (omitted when empty), description, then the optional
 * tags (omitted when empty), lifecycle. NO posture field.
 */
function objectSpecToCbor(spec: WireObjectSpec): unknown {
  const out: Record<string, unknown> = {
    name: spec.name,
    kind: spec.kind,
    selector_kind: spec.selector_kind,
    selector_value: spec.selector_value,
  };
  if (spec.attributes !== undefined && spec.attributes.length > 0)
    out['attributes'] = spec.attributes;
  out['description'] = spec.description;
  if (spec.tags !== undefined && spec.tags.length > 0) out['tags'] = spec.tags;
  out['lifecycle'] = spec.lifecycle;
  return out;
}

/** OBJECT_CREATE / OBJECT_EDIT (crdb OB.4). Rust struct order: request_id, spec, operator. */
function objectWriteToCbor(request: WireObjectCreate | WireObjectEdit): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    spec: objectSpecToCbor(request.spec),
  };
  applyOperator(out, request.operator);
  return out;
}

/** OBJECT_DELETE (crdb OB.4). Rust struct order: request_id, name, operator. */
function objectDeleteToCbor(request: WireObjectDelete): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    name: request.name,
  };
  applyOperator(out, request.operator);
  return out;
}

/** The entity-decisions read (ENTITY_DECISIONS, crdb ER.2c). */
function entityDecisionsToCbor(request: WireEntityDecisions): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    entity_type: request.entity_type,
    entity_value: request.entity_value,
    limit: request.limit,
  };
  applyOperator(out, request.operator);
  return out;
}

/** The connectivity read (ENTITY_CONNECTIONS, crdb ER.5). */
function entityConnectionsToCbor(request: WireEntityConnections): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    subject_kind: request.subject_kind,
    subject_id: request.subject_id,
    limit: request.limit,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The tenant-wide connectivity read (CONNECTIVITY_GRAPH, crdb IP-CONSOLE-CONNECTIVITY CN.2). Fields in the
 * Rust struct order (request_id, since?, until?, limit, operator?); `since`/`until`/`operator` carry
 * `skip_serializing_if = "Option::is_none"`, so a null bound is OMITTED (never emitted as null), matching
 * the engine's byte shape exactly.
 */
function connectivityQueryToCbor(request: WireConnectivityQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  if (request.since != null) out['since'] = request.since;
  if (request.until != null) out['until'] = request.until;
  out['limit'] = request.limit;
  applyOperator(out, request.operator);
  return out;
}

/**
 * The per-container class-members read (CONNECTIVITY_MEMBERS, crdb IP-CONSOLE-01 O1.6b). Fields in the
 * Rust struct order (request_id, class, limit, operator?); `operator` carries
 * `skip_serializing_if = "Option::is_none"`, so an absent operator is OMITTED, matching the byte shape.
 */
function connectivityMembersToCbor(request: WireConnectivityMembers): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    class: request.class,
    limit: request.limit,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The tenant-wide decision-LOG read (LOG_QUERY, crdb IP-CONSOLE-LOG-QUERY LQ.2). Fields in the Rust
 * struct order (request_id, since?, until?, technique?, tactic?, rule_id?, confidence?, action?, search?,
 * limit, operator?); every `Option` filter carries `skip_serializing_if = "Option::is_none"`, so an unset
 * filter is OMITTED (never emitted as null), matching the engine's byte shape exactly.
 */
function logQueryToCbor(request: WireLogQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  if (request.since != null) out['since'] = request.since;
  if (request.until != null) out['until'] = request.until;
  if (request.technique != null) out['technique'] = request.technique;
  if (request.tactic != null) out['tactic'] = request.tactic;
  if (request.rule_id != null) out['rule_id'] = request.rule_id;
  if (request.confidence != null) out['confidence'] = request.confidence;
  if (request.action != null) out['action'] = request.action;
  if (request.search != null) out['search'] = request.search;
  out['limit'] = request.limit;
  // SQ.8b: the page offset rides the wire only when set (byte-compatible with offset-less peers).
  if (request.offset != null && request.offset > 0) out['offset'] = request.offset;
  applyOperator(out, request.operator);
  return out;
}

/**
 * The decision-by-id EXPLAIN read (LOG_EXPLAIN, crdb LQ.3). Fields in the Rust struct order (request_id,
 * decision_id, operator?); `operator` carries `skip_serializing_if = "Option::is_none"`.
 */
function logExplainToCbor(request: WireLogExplain): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    decision_id: request.decision_id,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * The audited export of the filtered LOG (LOG_EXPORT, crdb LQ.4). Fields in the Rust struct order
 * (operator?, query, command_id, issued_at); `operator` is first and carries
 * `skip_serializing_if = "Option::is_none"`, so an absent operator is OMITTED. The embedded `query` is a
 * nested `WireLogQuery` map; its own `operator` is ignored by the engine (the top-level one is
 * authoritative) but still serialized per its skip-if-none rule.
 */
function logExportToCbor(request: WireLogExport): unknown {
  const out: Record<string, unknown> = {};
  applyOperator(out, request.operator);
  out['query'] = logQueryToCbor(request.query);
  out['command_id'] = request.command_id;
  out['issued_at'] = request.issued_at;
  return out;
}

/**
 * The operator containment disposition (CONTAIN, crdb IP-CONTAIN-COMMAND). Rust struct order
 * (operator?, request); `operator` carries skip-if-none so an absent one is OMITTED.
 */
function containToCbor(request: WireContain): unknown {
  const out: Record<string, unknown> = {};
  applyOperator(out, request.operator);
  out['request'] = request.request;
  return out;
}

/**
 * A zone definition (`WireVtzSpec`). Fields in the Rust struct order (name, description, zone_type,
 * own_postures, micro_segmentation, telemetry, reauth_interval_hours, lifecycle) so the CBOR map is
 * byte-identical to a native client's. Every field is required -- there is no skip-if-none here.
 */
function vtzSpecToCbor(spec: WireVtzSpec): unknown {
  return {
    name: spec.name,
    description: spec.description,
    zone_type: spec.zone_type,
    own_postures: spec.own_postures.map((p) => ({
      domain: p.domain,
      posture: p.posture,
      floor: p.floor,
    })),
    micro_segmentation: spec.micro_segmentation,
    telemetry: spec.telemetry,
    reauth_interval_hours: spec.reauth_interval_hours,
    lifecycle: spec.lifecycle,
  };
}

/** `VTZ_TREE` (VZ.3). Rust struct order: request_id, limit, operator?. */
function vtzTreeToCbor(request: WireVtzTreeQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id, limit: request.limit };
  applyOperator(out, request.operator);
  return out;
}

/** `VTZ_DETAIL` (VZ.3). Rust struct order: request_id, vtz_id, operator?. */
function vtzDetailToCbor(request: WireVtzDetailQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id, vtz_id: request.vtz_id };
  applyOperator(out, request.operator);
  return out;
}

/**
 * `BUNDLE_CONVERGENCE` (FD.7c, crdb IP-CONSOLE-02-FORGE-DISTRIBUTION). Rust struct order:
 * request_id, vtz_id. A tenant-scoped read: the operator delegation is injected server-side from the
 * session, so there is no operator field on the wire (unlike the VTZ writes).
 */
function bundleConvergenceToCbor(request: WireBundleConvergenceQuery): unknown {
  return { request_id: request.request_id, vtz_id: request.vtz_id };
}

/**
 * `BUNDLE_COMMIT` (FD.2). Rust struct order: request_id, bundle, operator?. `bundle` is a plain
 * `Vec<u8>` on the engine (NO serde_bytes, cf. `WireBundleCommit`), so it encodes as a CBOR array of
 * integers -- exactly what a JS `Array<number>` produces; passing it through verbatim is byte-correct.
 */
function bundleCommitToCbor(request: WireBundleCommit): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    bundle: request.bundle,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `VTZ_CREATE` / `VTZ_EDIT` (VZ.4). Rust struct order: request_id, spec, operator?. */
function vtzSpecRequestToCbor(request: WireVtzCreate | WireVtzEdit): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    spec: vtzSpecToCbor(request.spec),
  };
  applyOperator(out, request.operator);
  return out;
}

/** `VTZ_RESCOPE` (VZ.4). Rust struct order: request_id, vtz_id, new_name, operator?. */
function vtzRescopeToCbor(request: WireVtzRescope): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz_id: request.vtz_id,
    new_name: request.new_name,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `VTZ_DELETE` (VZ.4). Rust struct order: request_id, vtz_id, operator?. */
function vtzDeleteToCbor(request: WireVtzDelete): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz_id: request.vtz_id,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `POLICY_LIST_BY_ZONE` (PS.5). Rust struct order: request_id, operator?. */
function policyListToCbor(request: WirePolicyListQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/** `POLICY_DETAIL` (PS.5). Rust struct order: request_id, vtz, id, operator?. */
/** `DETECT_SUMMARY` (crdb FV.6): the SOC detection summary. Rust struct order: request_id, operator?. */
function detectSummaryToCbor(request: WireDetectSummaryQuery): unknown {
  const out: Record<string, unknown> = { request_id: request.request_id };
  applyOperator(out, request.operator);
  return out;
}

/**
 * `SOC_INCIDENT_LIST` (crdb SS.4b): the ranked decision queue. Rust struct order: request_id, limit,
 * operator?.
 */
function socIncidentListToCbor(request: WireSocIncidentListQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    limit: request.limit,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `SOC_INCIDENT_DETAIL` (crdb SS.4b). Rust struct order: request_id, incident, operator?. */
function socIncidentDetailToCbor(request: WireSocIncidentDetailQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    incident: request.incident,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `SOC_NARRATIVE` (crdb VN.7b). Rust struct order: request_id, incident, operator?. */
function socNarrativeToCbor(request: WireSocNarrativeQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    incident: request.incident,
  };
  applyOperator(out, request.operator);
  return out;
}

function policyDetailToCbor(request: WirePolicyDetailQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz: request.vtz,
    id: request.id,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `POLICY_EFFECTIVE` (P5.5, the PS.7 composer seam). Rust struct order: request_id, vtz, operator?. */
function policyEffectiveToCbor(request: WirePolicyEffectiveQuery): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz: request.vtz,
  };
  applyOperator(out, request.operator);
  return out;
}

/** One authored rule (flat wire idiom). Rust `WirePolicyRule` field order. */
function policyRuleToCbor(rule: WirePolicyRule): unknown {
  return {
    source_kind: rule.source_kind,
    source_selector_kind: rule.source_selector_kind,
    source_selector_value: rule.source_selector_value,
    destination_kind: rule.destination_kind,
    destination_selector_kind: rule.destination_selector_kind,
    destination_selector_value: rule.destination_selector_value,
    action: rule.action,
  };
}

/** One Applied-To scope member. Rust `WireScopeMember`: endpoint_cn, then the optional agent. */
function scopeMemberToCbor(member: WireScopeMember): unknown {
  const out: Record<string, unknown> = { endpoint_cn: member.endpoint_cn };
  if (member.agent !== undefined && member.agent !== null) out['agent'] = member.agent;
  return out;
}

/** One per-domain default posture. Rust `WireDomainPosture` field order. */
function domainPostureToCbor(posture: WireDomainPosture): unknown {
  return { domain: posture.domain, posture: posture.posture, floor: posture.floor };
}

/**
 * `WirePolicySpec` (PS.6). Mirrors the Rust field order and its `skip_serializing_if` exactly: the
 * required fields always emit; the optional collections are omitted when empty and the optional
 * scalars when absent, so the CBOR matches what the engine's serde would produce.
 */
function policySpecToCbor(spec: WirePolicySpec): unknown {
  const out: Record<string, unknown> = {
    vtz: spec.vtz,
    name: spec.name,
    description: spec.description,
    rules: (spec.rules ?? []).map(policyRuleToCbor),
  };
  if (spec.protocols !== undefined && spec.protocols.length > 0) out['protocols'] = spec.protocols;
  if (spec.ports !== undefined && spec.ports.length > 0) out['ports'] = spec.ports;
  if (spec.schedule_days !== undefined && spec.schedule_days.length > 0)
    out['schedule_days'] = spec.schedule_days;
  if (spec.schedule_start_minute !== undefined && spec.schedule_start_minute !== null)
    out['schedule_start_minute'] = spec.schedule_start_minute;
  if (spec.schedule_end_minute !== undefined && spec.schedule_end_minute !== null)
    out['schedule_end_minute'] = spec.schedule_end_minute;
  if (spec.active_from !== undefined && spec.active_from !== null)
    out['active_from'] = spec.active_from;
  if (spec.active_until !== undefined && spec.active_until !== null)
    out['active_until'] = spec.active_until;
  if (spec.geo !== undefined && spec.geo.length > 0) out['geo'] = spec.geo;
  if (spec.restriction_tags !== undefined && spec.restriction_tags.length > 0)
    out['restriction_tags'] = spec.restriction_tags;
  out['logging'] = spec.logging;
  if (spec.applied_to !== undefined && spec.applied_to.length > 0)
    out['applied_to'] = spec.applied_to.map(scopeMemberToCbor);
  out['max_classification'] = spec.max_classification;
  if (spec.default_postures !== undefined && spec.default_postures.length > 0)
    out['default_postures'] = spec.default_postures.map(domainPostureToCbor);
  return out;
}

/** `POLICY_CREATE` / `POLICY_EDIT` (PS.6). Rust struct order: request_id, [id,] spec, operator?. */
function policyCreateToCbor(request: WirePolicyCreate): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    spec: policySpecToCbor(request.spec),
  };
  applyOperator(out, request.operator);
  return out;
}

function policyEditToCbor(request: WirePolicyEdit): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    id: request.id,
    spec: policySpecToCbor(request.spec),
  };
  applyOperator(out, request.operator);
  return out;
}

/** `POLICY_PUBLISH` (PS.6). Rust struct order: request_id, vtz, id, version, operator?. */
function policyPublishToCbor(request: WirePolicyPublish): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz: request.vtz,
    id: request.id,
    version: request.version,
  };
  applyOperator(out, request.operator);
  return out;
}

/** `POLICY_DELETE` (PS.6). Rust struct order: request_id, vtz, id, operator?. */
function policyDeleteToCbor(request: WirePolicyDelete): unknown {
  const out: Record<string, unknown> = {
    request_id: request.request_id,
    vtz: request.vtz,
    id: request.id,
  };
  applyOperator(out, request.operator);
  return out;
}

/**
 * Encode a WireRequest to its CBOR frame payload. The read + cursor variants (what the Console's reads
 * need) are supported; the write-path variants throw a clear error rather than emit a wrong shape.
 */
export function encodeWireRequest(request: WireRequest): Uint8Array {
  if (request === 'TxnBegin') return encode('TxnBegin');
  if ('QuerySubmit' in request) return encode({ QuerySubmit: submitToCbor(request.QuerySubmit) });
  if ('SubmitMemoryWrite' in request) {
    return encode({ SubmitMemoryWrite: submitToCbor(request.SubmitMemoryWrite) });
  }
  if ('ListAgents' in request) return encode({ ListAgents: listAgentsToCbor(request.ListAgents) });
  if ('ListPrincipals' in request) {
    return encode({ ListPrincipals: directoryReadToCbor(request.ListPrincipals) });
  }
  if ('ListGroups' in request)
    return encode({ ListGroups: directoryReadToCbor(request.ListGroups) });
  if ('ObjectList' in request) return encode({ ObjectList: objectListToCbor(request.ObjectList) });
  if ('IdamConnectors' in request)
    return encode({ IdamConnectors: idamConnectorsToCbor(request.IdamConnectors) });
  if ('IdamSync' in request) return encode({ IdamSync: idamSyncToCbor(request.IdamSync) });
  if ('IdamConnect' in request)
    return encode({ IdamConnect: idamConnectToCbor(request.IdamConnect) });
  if ('IdamConfigure' in request)
    return encode({ IdamConfigure: idamConfigureToCbor(request.IdamConfigure) });
  if ('ObjectDetail' in request)
    return encode({ ObjectDetail: objectDetailToCbor(request.ObjectDetail) });
  if ('ObjectCreate' in request)
    return encode({ ObjectCreate: objectWriteToCbor(request.ObjectCreate) });
  if ('ObjectEdit' in request) return encode({ ObjectEdit: objectWriteToCbor(request.ObjectEdit) });
  if ('ObjectDelete' in request)
    return encode({ ObjectDelete: objectDeleteToCbor(request.ObjectDelete) });
  if ('GroupCreate' in request)
    return encode({ GroupCreate: groupWriteToCbor(request.GroupCreate) });
  if ('GroupEdit' in request) return encode({ GroupEdit: groupWriteToCbor(request.GroupEdit) });
  if ('GroupSetMembers' in request)
    return encode({ GroupSetMembers: groupSetMembersToCbor(request.GroupSetMembers) });
  if ('PrincipalCreate' in request)
    return encode({ PrincipalCreate: principalWriteToCbor(request.PrincipalCreate) });
  if ('PrincipalEdit' in request)
    return encode({ PrincipalEdit: principalWriteToCbor(request.PrincipalEdit) });
  if ('PrincipalSetStatus' in request)
    return encode({ PrincipalSetStatus: principalSetStatusToCbor(request.PrincipalSetStatus) });
  if ('EntityDecisions' in request) {
    return encode({ EntityDecisions: entityDecisionsToCbor(request.EntityDecisions) });
  }
  if ('EntityConnections' in request) {
    return encode({ EntityConnections: entityConnectionsToCbor(request.EntityConnections) });
  }
  if ('ConnectivityGraph' in request) {
    return encode({ ConnectivityGraph: connectivityQueryToCbor(request.ConnectivityGraph) });
  }
  if ('ConnectivityMembers' in request) {
    return encode({ ConnectivityMembers: connectivityMembersToCbor(request.ConnectivityMembers) });
  }
  if ('LogQuery' in request) return encode({ LogQuery: logQueryToCbor(request.LogQuery) });
  if ('LogExplain' in request) {
    return encode({ LogExplain: logExplainToCbor(request.LogExplain) });
  }
  if ('LogExport' in request) return encode({ LogExport: logExportToCbor(request.LogExport) });
  if ('Contain' in request) return encode({ Contain: containToCbor(request.Contain) });
  if ('VtzTree' in request) return encode({ VtzTree: vtzTreeToCbor(request.VtzTree) });
  if ('VtzDetail' in request) return encode({ VtzDetail: vtzDetailToCbor(request.VtzDetail) });
  if ('VtzCreate' in request) {
    return encode({ VtzCreate: vtzSpecRequestToCbor(request.VtzCreate) });
  }
  if ('VtzEdit' in request) return encode({ VtzEdit: vtzSpecRequestToCbor(request.VtzEdit) });
  if ('VtzRescope' in request) {
    return encode({ VtzRescope: vtzRescopeToCbor(request.VtzRescope) });
  }
  if ('VtzDelete' in request) return encode({ VtzDelete: vtzDeleteToCbor(request.VtzDelete) });
  if ('BundleConvergence' in request) {
    return encode({ BundleConvergence: bundleConvergenceToCbor(request.BundleConvergence) });
  }
  if ('BundleCommit' in request) {
    return encode({ BundleCommit: bundleCommitToCbor(request.BundleCommit) });
  }
  if ('PolicyListByZone' in request) {
    return encode({ PolicyListByZone: policyListToCbor(request.PolicyListByZone) });
  }
  if ('PolicyDetail' in request) {
    return encode({ PolicyDetail: policyDetailToCbor(request.PolicyDetail) });
  }
  if ('PolicyEffective' in request) {
    return encode({ PolicyEffective: policyEffectiveToCbor(request.PolicyEffective) });
  }
  if ('PolicyCreate' in request) {
    return encode({ PolicyCreate: policyCreateToCbor(request.PolicyCreate) });
  }
  if ('PolicyEdit' in request) return encode({ PolicyEdit: policyEditToCbor(request.PolicyEdit) });
  if ('PolicyPublish' in request) {
    return encode({ PolicyPublish: policyPublishToCbor(request.PolicyPublish) });
  }
  if ('PolicyDelete' in request) {
    return encode({ PolicyDelete: policyDeleteToCbor(request.PolicyDelete) });
  }
  if ('DetectSummary' in request) {
    return encode({ DetectSummary: detectSummaryToCbor(request.DetectSummary) });
  }
  if ('SocIncidentList' in request) {
    return encode({ SocIncidentList: socIncidentListToCbor(request.SocIncidentList) });
  }
  if ('SocIncidentDetail' in request) {
    return encode({ SocIncidentDetail: socIncidentDetailToCbor(request.SocIncidentDetail) });
  }
  if ('SocNarrative' in request) {
    return encode({ SocNarrative: socNarrativeToCbor(request.SocNarrative) });
  }
  if ('CursorFetch' in request)
    return encode({ CursorFetch: { handle: request.CursorFetch.handle } });
  if ('CursorClose' in request)
    return encode({ CursorClose: { handle: request.CursorClose.handle } });
  throw new Error(
    'encodeWireRequest: this WireRequest variant is not yet supported (write path, F0.3b follow-on)',
  );
}

/** Decode a WireReply from a CBOR frame payload. */
export function decodeWireReply(payload: Uint8Array): WireReply {
  return decode(payload) as WireReply;
}
