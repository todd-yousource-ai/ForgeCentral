// packages/wire/src/dispatch.ts -- operation request/reply dispatch (F0.3b-3c).
//
// After the handshake reaches Ready, the client sends operation frames and reads replies. A request is a
// CBOR-encoded externally-tagged `WireRequest` carried on its frame opcode; the reply is a CBOR
// externally-tagged `WireReply`. This matches crdb's dispatch exactly (the reactor decodes the payload as
// its `Request` enum and frames the reply as its `Reply` enum). Query/write ops share the `QuerySubmit`
// opcode -- the enum tag inside the payload discriminates them (as in the node's own tests).
//
// This is synchronous request/reply on stream 0 (one in-flight op per connection, which is what crdb's
// own client tests do); multiplexing distinct `stream_id`s is a later enhancement.

import type { WireReply, WireRequest } from '@forge/contracts';

import { Flags, FrameType } from './frame.js';
import { decodeWireReply, encodeWireRequest } from './payload.js';
import { type FrameTransport, WireProtocolError } from './transport.js';

/** The frame opcode a request is carried on. */
function frameTypeForRequest(request: WireRequest): FrameType {
  if (request === 'TxnBegin') return FrameType.TxnBegin;
  // The read + memory-write submit verbs all ride the QuerySubmit opcode; the payload's enum tag
  // (`QuerySubmit` / `SubmitMemoryWrite` / `ListAgents` / `EntityDecisions` / `EntityConnections`)
  // discriminates them server-side, exactly as the node's own client tests do.
  if (
    typeof request === 'object' &&
    ('QuerySubmit' in request ||
      'SubmitMemoryWrite' in request ||
      'ListAgents' in request ||
      'EntityDecisions' in request ||
      'EntityConnections' in request ||
      // The tenant-wide connectivity roll-up (CONNECTIVITY_GRAPH, crdb IP-CONSOLE-CONNECTIVITY) rides the
      // QuerySubmit opcode too; the engine discriminates it by its CBOR enum tag.
      'ConnectivityGraph' in request ||
      // The per-container class-members read (CONNECTIVITY_MEMBERS, crdb IP-CONSOLE-01 O1.6b) rides the
      // QuerySubmit opcode too; the engine discriminates it by its CBOR enum tag.
      'ConnectivityMembers' in request ||
      // The decision-LOG reads (LOG_QUERY / LOG_EXPLAIN, crdb IP-CONSOLE-LOG-QUERY) ride the QuerySubmit
      // opcode too; the engine discriminates them by their CBOR enum tag.
      'LogQuery' in request ||
      'LogExplain' in request ||
      // LOG_EXPORT is an audited data-plane write; like Contain it rides the QuerySubmit opcode.
      'LogExport' in request ||
      // Contain is a data-plane write; like SubmitMemoryWrite it rides the QuerySubmit opcode and the
      // engine discriminates it by its CBOR enum tag, then routes it to the write path + Data-plane gate.
      'Contain' in request ||
      // The VTZ reads (VTZ_TREE / VTZ_DETAIL, crdb IP-CONSOLE-VTZ-SUBSTRATE VZ.3b) ride the QuerySubmit
      // opcode too; the engine discriminates them by their CBOR enum tag (handler.rs routes them in the
      // same read allowlist as ConnectivityGraph).
      'VtzTree' in request ||
      'VtzDetail' in request ||
      // The four audited VTZ writes ride it as well; like Contain the engine routes them to the write
      // path + Data-plane gate after discriminating the tag.
      'VtzCreate' in request ||
      'VtzEdit' in request ||
      'VtzRescope' in request ||
      'VtzDelete' in request ||
      // The Forge policy-distribution verbs (FD.2 BUNDLE_COMMIT, FD.7c BUNDLE_CONVERGENCE, crdb
      // IP-CONSOLE-02-FORGE-DISTRIBUTION) ride the QuerySubmit opcode too: the engine discriminates
      // them by their CBOR enum tag, routing the commit to the write path + Data-plane gate (like
      // Contain) and the convergence read to the read allowlist (like VtzDetail).
      'BundleCommit' in request ||
      'BundleConvergence' in request ||
      // The Users-surface directory reads (LIST_PRINCIPALS / LIST_GROUPS, crdb ER.6) ride the
      // QuerySubmit opcode too; the engine discriminates them by their CBOR enum tag.
      'ListPrincipals' in request ||
      'ListGroups' in request ||
      // The E3 provisioning command (GROUP_CREATE, crdb LU.P) rides the QuerySubmit opcode like the
      // other data-plane writes; the engine routes it to the write path by its CBOR enum tag.
      'GroupCreate' in request ||
      'GroupEdit' in request ||
      'GroupSetMembers' in request ||
      'PrincipalCreate' in request ||
      'PrincipalEdit' in request ||
      'PrincipalSetStatus' in request)
  ) {
    return FrameType.QuerySubmit;
  }
  if (typeof request === 'object' && 'CursorFetch' in request) return FrameType.CursorFetch;
  if (typeof request === 'object' && 'CursorClose' in request) return FrameType.CursorClose;
  throw new WireProtocolError(
    'dispatch: this WireRequest variant is not yet wired to a frame opcode',
  );
}

/**
 * Send a `WireRequest` on a ready (post-handshake) transport and await its `WireReply`. One request/reply
 * at a time per connection (stream 0), matching the engine's synchronous dispatch.
 */
export async function dispatch(
  transport: FrameTransport,
  request: WireRequest,
): Promise<WireReply> {
  await transport.send({
    frameType: frameTypeForRequest(request),
    streamId: 0,
    flags: Flags.END_STREAM,
    payload: encodeWireRequest(request),
  });
  const frame = await transport.recv();
  return decodeWireReply(frame.payload);
}

/**
 * Send a wire-level PING heartbeat on stream 0 and await the PONG. This refreshes the engine session
 * lease (TRD-04a 3.1: a heartbeat frame on a lapsed lease closes the connection, so a client must PING
 * within the lease window) and doubles as a liveness probe -- a resolved PONG proves the sidecar and the
 * engine are reachable, where a shallow "is the socket object non-null" check cannot. It must be
 * serialized with `dispatch` on the same transport (one in-flight frame per connection, stream 0).
 */
export async function heartbeat(transport: FrameTransport): Promise<void> {
  await transport.send({
    frameType: FrameType.Ping,
    streamId: 0,
    flags: Flags.END_STREAM,
    payload: new Uint8Array(0),
  });
  const frame = await transport.recv();
  if (frame.header.frameType !== FrameType.Pong) {
    throw new WireProtocolError(
      `heartbeat: expected a PONG reply, got frame type 0x${frame.header.frameType.toString(16)}`,
    );
  }
}
