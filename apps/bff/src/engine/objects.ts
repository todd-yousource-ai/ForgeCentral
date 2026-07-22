// apps/bff/src/engine/objects.ts -- the Objects-surface read resolvers (IP-CONSOLE-10 O10.2).
//
// Projects the crdb named-object registry reads into the Console view models: `objects.list` is the
// catalog (OBJECT_LIST, crdb OB.3) grouped client-side by kind; `objects.detail` is one object plus
// its READ-TIME resolved members (OBJECT_DETAIL). Both are engine-bounded (the per-tenant ceiling
// refuses rather than truncating), tenant-private, and operator-delegated via `OperatorEngine`
// (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED: a record carrying an engine tag the contract cannot narrow collapses the WHOLE
// response to `ObjectsUnavailableError` -- a catalog silently missing objects is exactly the lie the
// no-stub rule forbids on a governance surface (INV-CONSOLE-OBJECTS-NOUN-ONLY).

import type {
  ObjectCard,
  ObjectDetailView,
  ObjectDraft,
  ObjectMutation,
  WireObjectDetailQuery,
  WireObjectList,
} from '@forge/contracts';
import {
  toObjectCatalog,
  toObjectDetail,
  toObjectMutation,
  toWireObjectSpec,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine returned a record the Console cannot render honestly; the route surfaces 503. */
export class ObjectsUnavailableError extends Error {
  constructor(what: string) {
    super(`objects read cannot be rendered honestly: ${what}`);
    this.name = 'ObjectsUnavailableError';
  }
}

let nextRequestId = 1n;
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/** Resolve the object catalog (grouping by kind is the surface's projection). */
export async function resolveObjectCatalog(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly ObjectCard[]> {
  const request: WireObjectList = { request_id: requestId() };
  const catalog = await engine.objectList(principal, request, opts);
  const cards = toObjectCatalog(catalog);
  if (cards === null) {
    throw new ObjectsUnavailableError('an object record carries an unknown engine tag');
  }
  return cards;
}

/** A command the engine refused, carried typed for the route (409 dup / 400 malformed / 403 deny). */
export class ObjectCommandError extends Error {
  constructor(readonly wireClass: string) {
    super(`object command refused: ${wireClass}`);
    this.name = 'ObjectCommandError';
  }
}

/** Register a named object (`objects.create` -> crdb OBJECT_CREATE, audited, duplicate-refused). */
export async function resolveCreateObject(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: ObjectDraft,
  opts?: EngineCallOptions,
): Promise<ObjectMutation> {
  const reply = await engine.objectCreate(
    principal,
    { request_id: requestId(), spec: toWireObjectSpec(draft) },
    opts,
  );
  return toObjectMutation(reply);
}

/** Edit a named object's definition (`objects.edit` -> crdb OBJECT_EDIT, audited). */
export async function resolveEditObject(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: ObjectDraft,
  opts?: EngineCallOptions,
): Promise<ObjectMutation> {
  const reply = await engine.objectEdit(
    principal,
    { request_id: requestId(), spec: toWireObjectSpec(draft) },
    opts,
  );
  return toObjectMutation(reply);
}

/** Delete a named object (`objects.delete` -> crdb OBJECT_DELETE, tombstoned; history preserved). */
export async function resolveDeleteObject(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  name: string,
  opts?: EngineCallOptions,
): Promise<ObjectMutation> {
  const reply = await engine.objectDelete(principal, { request_id: requestId(), name }, opts);
  return toObjectMutation(reply);
}

/** Resolve one object's detail + its read-time members (the drawer). */
export async function resolveObjectDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  name: string,
  opts?: EngineCallOptions,
): Promise<ObjectDetailView> {
  const request: WireObjectDetailQuery = { request_id: requestId(), name };
  const detail = await engine.objectDetail(principal, request, opts);
  const view = toObjectDetail(detail);
  if (view === null) {
    throw new ObjectsUnavailableError('the object record carries an unknown engine tag');
  }
  return view;
}
