// packages/wire/src/index.ts -- the @forge/wire barrel (F0.3b-1).
//
// @forge/wire is the native TypeScript client of the Crucible wire protocol (the BFF's transport to the
// engine over mTLS :7878), ported faithfully from crdb `cdb-wire`. F0.3b-1 lands the frame codec; the
// CBOR payload codec, the handshake, and the mTLS connection follow (F0.3b-2/3b-3).

export * from './frame.js';
export * from './cbor.js';
export * from './payload.js';
export * from './transport.js';
export * from './handshake.js';
