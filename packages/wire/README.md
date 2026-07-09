# @forge/wire

The native TypeScript client of the **Crucible wire protocol** -- the BFF's transport to the engine over
mTLS `:7878`. A faithful port of crdb `cdb-wire` (`crates/cdb-wire/`), so the Console speaks the same wire
as Torch and the engine, verified against crdb's own byte-vectors. This is the F0.3b deliverable of
`IP-CONSOLE-00-FOUNDATION` (the transport behind the BFF's `CrucibleClient` seam).

## Status (built incrementally)

- **F0.3b-1 (this):** the **frame codec** -- the 16-byte big-endian header (`protocol_version / frame_type
/ stream_id / flags / reserved / payload_len`) + the `FrameType` opcodes + decode validation
  (reserved-zero, known-flags, payload bound), matching `cdb-wire` exactly.
- **F0.3b-2 (next):** the **CBOR payload codec** for `WireRequest` / `WireReply` (interoperating with the
  Rust node's ciborium encoding), tested against vectors generated from crdb.
- **F0.3b-3:** the **handshake** (`Hello -> Negotiate -> Authenticate -> Ready`), the **mTLS** connection,
  request/reply correlation over `stream_id`, and a **live round-trip** against the local node.

## Why a port, not a reimplementation

The wire format is defined once, in crdb. This package mirrors it byte-for-byte (the tests assert the same
vectors crdb asserts); it does not invent a protocol. When crdb evolves the wire, this port follows, gated
by the shared vectors.

## Tests

`pnpm --filter @forge/wire test` (Vitest). F0.3b-1: the exact-byte header layout, encode/decode
round-trips, the opcode pins, and the decode-validation failures.
