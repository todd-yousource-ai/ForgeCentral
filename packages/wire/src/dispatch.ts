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
  // Query submit and the memory-write submit both ride the QuerySubmit opcode; the payload's enum tag
  // (`QuerySubmit` / `SubmitMemoryWrite`) distinguishes them server-side.
  if (typeof request === 'object' && ('QuerySubmit' in request || 'SubmitMemoryWrite' in request)) {
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
