// packages/wire/src/payload.ts -- typed WireRequest/WireReply CBOR payloads (F0.3b-2).
//
// The wire-DTO layer over the CBOR codec: it encodes a `WireRequest` (from @forge/contracts) to the CBOR
// bytes a frame carries, and decodes a frame payload back to a `WireReply`. The generated types are
// already in serde's externally-tagged shape, so decoding is a direct CBOR decode. Encoding needs one
// piece of wire-specific knowledge: the float-typed `WireValue` variants (`Float`, `Vector`) must be
// emitted as CBOR floats even when their value is integer-valued, which `wireValueToCbor` handles.

import type {
  OperatorDelegation,
  WireConnectivityQuery,
  WireEntityConnections,
  WireEntityDecisions,
  WireListAgents,
  WireQuerySubmit,
  WireReply,
  WireRequest,
  WireValue,
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
  if ('EntityDecisions' in request) {
    return encode({ EntityDecisions: entityDecisionsToCbor(request.EntityDecisions) });
  }
  if ('EntityConnections' in request) {
    return encode({ EntityConnections: entityConnectionsToCbor(request.EntityConnections) });
  }
  if ('ConnectivityGraph' in request) {
    return encode({ ConnectivityGraph: connectivityQueryToCbor(request.ConnectivityGraph) });
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
