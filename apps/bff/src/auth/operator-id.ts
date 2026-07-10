// apps/bff/src/auth/operator-id.ts -- the deterministic operator PrincipalId (F0.5c producer).
//
// The engine records the operator a delegated read runs as by `PrincipalId` (a UUID). ForgeCentral owns
// operator identity (the engine is a consumer, not an authority), so the Console mints a STABLE
// `PrincipalId` from the operator's verified OIDC subject: an RFC 4122 v5 (name-based, SHA-1) UUID under a
// fixed ForgeCentral namespace. Deterministic (same subject -> same id, across restarts and instances) and
// dependency-free (node:crypto). It is an identifier for audit/attribution, never a credential.

import { createHash } from 'node:crypto';

// A fixed namespace UUID for ForgeCentral operator principals (a constant, not generated at runtime).
const OPERATOR_NAMESPACE = 'a7c9e1f0-3b2d-4c5e-8f6a-1d2b3c4d5e6f';

/** Parse a hyphenated UUID string into its 16 bytes. */
function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`invalid UUID: ${uuid}`);
  return Buffer.from(hex, 'hex');
}

/** Render 16 bytes as a hyphenated UUID string. */
function bytesToUuid(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** The stable engine `PrincipalId` (a v5 UUID string) for an operator, derived from their OIDC subject. */
export function operatorPrincipalId(subject: string): string {
  const hash = createHash('sha1')
    .update(uuidToBytes(OPERATOR_NAMESPACE))
    .update(Buffer.from(subject, 'utf8'))
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5 (name-based, SHA-1)
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant: RFC 4122
  return bytesToUuid(bytes);
}
