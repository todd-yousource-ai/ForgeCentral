// packages/wire/src/payload.ts -- typed WireRequest/WireReply CBOR payloads (F0.3b-2).
//
// The wire-DTO layer over the CBOR codec: it encodes a `WireRequest` (from @forge/contracts) to the CBOR
// bytes a frame carries, and decodes a frame payload back to a `WireReply`. The generated types are
// already in serde's externally-tagged shape, so decoding is a direct CBOR decode. Encoding needs one
// piece of wire-specific knowledge: the float-typed `WireValue` variants (`Float`, `Vector`) must be
// emitted as CBOR floats even when their value is integer-valued, which `wireValueToCbor` handles.

import type { WireQuerySubmit, WireReply, WireRequest, WireValue } from '@forge/contracts';

import { CborFloat, decode, encode } from './cbor.js';

/** Map a WireValue to its CBOR-ready form, forcing the float-typed variants to encode as floats. */
export function wireValueToCbor(value: WireValue): unknown {
  if ('Float' in value) return { Float: new CborFloat(value.Float) };
  if ('Vector' in value) return { Vector: value.Vector.map((n) => new CborFloat(n)) };
  return value; // Bool / Int / Text / Bytes / Timestamp encode correctly as-is
}

function submitToCbor(submit: WireQuerySubmit): unknown {
  // Field order matches the Rust struct (request_id, text, params, operator) so the CBOR map is
  // byte-identical.
  const out: Record<string, unknown> = {
    request_id: submit.request_id,
    text: submit.text,
    params: submit.params.map(([key, value]) => [key, wireValueToCbor(value)]),
  };
  // Operator delegation (F0.5c): emitted only when present, so a non-delegated read is byte-identical to
  // a pre-delegation client -- matching crdb's `#[serde(default, skip_serializing_if = "Option::is_none")]`.
  // The engine honors it only under the peer's Delegation grant; the ids are hyphenated UUID strings.
  if (submit.operator != null) {
    out['operator'] = { principal: submit.operator.principal, tenant: submit.operator.tenant };
  }
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
