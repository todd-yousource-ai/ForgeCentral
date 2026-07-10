// packages/wire/src/index.ts -- the @forge/wire barrel (F0.3b-1).
//
// @forge/wire is the native TypeScript client of the Crucible wire protocol, ported faithfully from crdb
// `cdb-wire`. The BFF carries these frames over a plaintext LOOPBACK socket to the AWS-LC crypto sidecar,
// which originates the engine mTLS on :7878 (CS.4; Node performs no TLS, INV-CONSOLE-CRYPTO-AWSLC).

export * from './frame.js';
export * from './cbor.js';
export * from './payload.js';
export * from './transport.js';
export * from './handshake.js';
export * from './socket-transport.js';
export * from './dispatch.js';
