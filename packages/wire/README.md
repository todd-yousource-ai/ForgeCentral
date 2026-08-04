# @forge/wire

The native TypeScript client of the **Crucible wire protocol** -- the BFF's
transport to the engine on `:7878`. A faithful port of crdb `cdb-wire`
(`crates/cdb-wire/`), so the Console speaks the same wire as Torch and the engine,
verified against crdb's own byte-vectors (F0.3b of `IP-CONSOLE-00-FOUNDATION`).

## What it implements

- **Frame codec** (`frame.ts`) -- the 16-byte big-endian header
  (`protocol_version / frame_type / stream_id / flags / reserved / payload_len`),
  the `FrameType` opcodes, and decode validation (reserved-zero, known-flags,
  payload bound), matching `cdb-wire` exactly.
- **CBOR payload codec** (`cbor.ts`, `payload.ts`) -- `WireRequest` / `WireReply`
  encode/decode interoperating with the Rust node's ciborium encoding, tested
  against vectors generated from crdb.
- **Both handshakes** (`handshake.ts`) -- the two planes differ, deliberately:
  - `clientHandshake` -- the **agent-plane** four-step
    (`Hello -> Negotiate -> Authenticate -> Ready`; AUTHENTICATE is an empty
    trigger -- the identity is the mTLS certificate, never a payload field).
  - `wireHandshake` -- the **reactor (CrucibleQL) plane** single round trip:
    `Hello -> Ready`, with the session derived inline server-side; READY
    advertises the lease window.
- **Dispatch + transport** (`dispatch.ts`, `transport.ts`,
  `socket-transport.ts`) -- request/reply correlation over `stream_id` and the
  concrete `FrameTransport` over the crypto sidecar's loopback (the BFF itself
  performs no TLS; `INV-CONSOLE-CRYPTO-AWSLC`).

## Why a port, not a reimplementation

The wire format is defined once, in crdb. This package mirrors it byte-for-byte
(the tests assert the same vectors crdb asserts); it does not invent a protocol.
When crdb evolves the wire, this port follows, gated by the shared vectors.

## Tests

`pnpm --filter @forge/wire test` (Vitest): the exact-byte header layout,
encode/decode round-trips, opcode pins, decode-validation failures, CBOR
interop vectors, both handshake sequences (including wrong-frame refusals), and
dispatch correlation. The live round-trip against a real node runs in the e2e
stage of `scripts/ci.sh`.
