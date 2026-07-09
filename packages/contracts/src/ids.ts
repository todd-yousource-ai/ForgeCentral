// packages/contracts/src/ids.ts -- branded identifier types (F0.1).
//
// The Console handles many opaque string ids from the engine (principals, tenants, decisions, VTZs,
// policies, request-correlation). A bare `string` lets any id be passed where another is expected -- a
// cross-module integration gap (AI Quality Guide bug category 3). A branded type makes each id nominally
// distinct at compile time while staying a plain string at runtime (zero cost). Assigning a `PrincipalId`
// where a `TenantId` is required is a type error; the codegen/type tests prove that distinctness.
//
// These are the ONE home for these id types (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE); every tier imports
// them rather than re-declaring `type PrincipalId = string`.

declare const brand: unique symbol;

/** A nominal string tagged with a compile-time-only brand `B`. Erases to `string` at runtime. */
export type Brand<B extends string> = string & { readonly [brand]: B };

/** The acting principal (human/agent/model/tool/service), per Crucible TRD-04. */
export type PrincipalId = Brand<'PrincipalId'>;
/** A tenant boundary; cross-tenant is impossible by engine layout (TRD-02/TRD-04). */
export type TenantId = Brand<'TenantId'>;
/** A governed decision/detection (the Console Decision Stream). */
export type DecisionId = Brand<'DecisionId'>;
/** A Virtual Trust Zone (Forge TRD-32 v2). */
export type VtzId = Brand<'VtzId'>;
/** A policy (draft/published, versioned), per TRD-04 / CONSOLE-05. */
export type PolicyId = Brand<'PolicyId'>;
/** A protected object/resource in the taxonomy (CONSOLE-10). */
export type ObjectId = Brand<'ObjectId'>;
/** A request-correlation id echoed by the engine (`WireError.correlation_id`, rendered). */
export type RequestId = Brand<'RequestId'>;

/**
 * Tag a raw string as the given id type. The Console does NOT validate id shape here (the engine is the
 * source of truth for id validity); this only crosses the nominal boundary at a trust edge where the
 * value is known to be that kind of id (a BFF handler mapping an engine field to a view model).
 */
function tag<B extends string>(raw: string): Brand<B> {
  return raw as Brand<B>;
}

export const principalId = (raw: string): PrincipalId => tag<'PrincipalId'>(raw);
export const tenantId = (raw: string): TenantId => tag<'TenantId'>(raw);
export const decisionId = (raw: string): DecisionId => tag<'DecisionId'>(raw);
export const vtzId = (raw: string): VtzId => tag<'VtzId'>(raw);
export const policyId = (raw: string): PolicyId => tag<'PolicyId'>(raw);
export const objectId = (raw: string): ObjectId => tag<'ObjectId'>(raw);
export const requestId = (raw: string): RequestId => tag<'RequestId'>(raw);
