// packages/contracts/src/objects.ts -- the Objects (protected resources) contract (IP-CONSOLE-10 O10.1).
//
// The Objects surface (TRD-CONSOLE-10) catalogs the tenant's NAMED OBJECTS -- the reusable policy
// NOUNS (sources and destinations) the Policy surface (TRD-CONSOLE-05) binds. This module is the ONE
// home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the view models the SPA renders
// and the BFF resolver produces, typed against the generated crdb wire DTOs. Both tiers import it, so
// a drifted field fails compilation on both sides.
//
// The engine half is the crdb named-object registry (crdb IP-CONSOLE-OBJECT-SUBSTRATE OB.1-OB.N,
// landed): a named object is a TRD-32 v2 ObjectRef (kind + selector + attributes) plus catalog
// identity. O10.1 lands the TYPES + projections only; no route, no surface.
//
// GROUNDED-DESIGN NOTES (INV-CONSOLE-OBJECTS-NOUN-ONLY):
//   * NOUN-ONLY: an object never applies policy (operator ruling). No posture/enforcement field
//     exists anywhere in the contract -- the record type has none engine-side, structurally.
//   * DECLARATIVE: an object needs no active LEG entity to exist; `members` on a detail read is the
//     selector resolved AT READ TIME (empty until something matches), never a stored list.
//   * The taxonomy is the shared TRD-32 v2 ObjectKind registry, not ad-hoc headings; grouping is by
//     kind. Storage is `data_store` (data at rest), distinct from `uri` (a network endpoint) and
//     `network` (an address range). People-groups are `group_ref` NAMES only (IdAM/Users-owned).
//
// Every narrowing is FAIL-CLOSED: an engine kind/selector/lifecycle tag the Console does not know
// collapses the projection to `null` rather than rendering a guessed object -- a mis-rendered policy
// noun is a security-relevant lie on a governance surface.

import type {
  WireObjectCatalog,
  WireObjectDetail,
  WireObjectMutated,
  WireObjectRecord,
  WireObjectSpec,
} from './generated/wire-dto.js';

/** The object kinds the engine emits (the TRD-32 v2 ObjectKind registry), narrowed closed. */
export const OBJECT_KINDS = [
  'user',
  'group',
  'agent',
  'service',
  'server',
  'application',
  'uri',
  'network',
  'registry_key',
  'certificate',
  'script',
  'data_store',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The selector forms a named object carries. */
export const SELECTOR_KINDS = ['exact', 'glob', 'group_ref', 'cidr'] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

/** The authoring lifecycle of a catalog object. */
export const OBJECT_LIFECYCLES = ['draft', 'published'] as const;
export type ObjectLifecycle = (typeof OBJECT_LIFECYCLES)[number];

/**
 * One catalog object (TRD-CONSOLE-10) -- a projection of the engine's `WireObjectRecord`. A named
 * TRD-32 v2 ObjectRef (kind + selector + attributes) plus catalog identity. Deliberately NO posture
 * field. The `selector` is the typed pair rendered read-only in the card/drawer.
 */
export interface ObjectCard {
  /** The object's unique name (the catalog's natural key). */
  readonly name: string;
  /** The object kind (the engine tag; grouping key). */
  readonly kind: ObjectKind;
  /** The selector form (`exact` / `glob` / `group_ref` / `cidr`). */
  readonly selectorKind: SelectorKind;
  /** The selector value (pattern, exact value, group id, or CIDR block). */
  readonly selectorValue: string;
  /** The object attributes (`broker` / `in_zone`), if any. */
  readonly attributes: readonly string[];
  /** The operator description. */
  readonly description: string;
  /** The classification / handling tags (e.g. `PHI`, `PII`). */
  readonly tags: readonly string[];
  /** The authoring lifecycle. */
  readonly lifecycle: ObjectLifecycle;
}

/**
 * A catalog object plus its READ-TIME resolved members (the drawer detail). `members` is the
 * selector evaluated against the tenant's observed entities at read time; empty means nothing
 * matches yet (a declarative object with no live members is normal, never an error). `object` is
 * null when the named object does not exist.
 */
export interface ObjectDetailView {
  readonly object: ObjectCard | null;
  readonly members: readonly string[];
}

/** The Create/Edit Object form's engine shape (`WireObjectSpec`); NO posture field. */
export interface ObjectDraft {
  readonly name: string;
  readonly kind: ObjectKind;
  readonly selectorKind: SelectorKind;
  readonly selectorValue: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly lifecycle: ObjectLifecycle;
}

/** An object command's acknowledgment (`WireObjectMutated`): the mutated name. */
export interface ObjectMutation {
  readonly name: string;
}

function toKind(tag: string): ObjectKind | null {
  return (OBJECT_KINDS as readonly string[]).includes(tag) ? (tag as ObjectKind) : null;
}
function toSelectorKind(tag: string): SelectorKind | null {
  return (SELECTOR_KINDS as readonly string[]).includes(tag) ? (tag as SelectorKind) : null;
}
function toLifecycle(tag: string): ObjectLifecycle | null {
  return (OBJECT_LIFECYCLES as readonly string[]).includes(tag) ? (tag as ObjectLifecycle) : null;
}

/**
 * Project one engine object record into a card. FAIL-CLOSED: an unknown kind, selector form, or
 * lifecycle tag returns `null` (the resolver surfaces unavailability rather than a guessed object).
 */
export function toObjectCard(record: WireObjectRecord): ObjectCard | null {
  const kind = toKind(record.kind);
  const selectorKind = toSelectorKind(record.selector_kind);
  const lifecycle = toLifecycle(record.lifecycle);
  if (kind === null || selectorKind === null || lifecycle === null) {
    return null;
  }
  return {
    name: record.name,
    kind,
    selectorKind,
    selectorValue: record.selector_value,
    attributes: record.attributes,
    description: record.description,
    tags: record.tags,
    lifecycle,
  };
}

/**
 * Project the OBJECT_LIST reply into cards. One malformed record collapses the WHOLE catalog
 * (`null`), not just the row: a catalog silently missing objects is the lie the no-stub rule forbids
 * on a governance surface.
 */
export function toObjectCatalog(catalog: WireObjectCatalog): readonly ObjectCard[] | null {
  const cards: ObjectCard[] = [];
  for (const record of catalog.objects) {
    const card = toObjectCard(record);
    if (card === null) {
      return null;
    }
    cards.push(card);
  }
  return cards;
}

/**
 * Project the OBJECT_DETAIL reply. A present-but-unprojectable record collapses to `null`
 * (unavailability); an absent record is `object: null` with whatever members resolved (normally
 * none). `members` is carried verbatim -- the engine's read-time resolution.
 */
export function toObjectDetail(detail: WireObjectDetail): ObjectDetailView | null {
  if (detail.record === undefined || detail.record === null) {
    return { object: null, members: detail.members };
  }
  const object = toObjectCard(detail.record);
  if (object === null) {
    return null;
  }
  return { object, members: detail.members };
}

/** Project a form draft into the wire spec (the only direction a draft travels). */
export function toWireObjectSpec(draft: ObjectDraft): WireObjectSpec {
  return {
    name: draft.name,
    kind: draft.kind,
    selector_kind: draft.selectorKind,
    selector_value: draft.selectorValue,
    description: draft.description,
    lifecycle: draft.lifecycle,
    ...(draft.tags.length === 0 ? {} : { tags: [...draft.tags] }),
  };
}

/** Project a command acknowledgment. */
export function toObjectMutation(reply: WireObjectMutated): ObjectMutation {
  return { name: reply.name };
}

/**
 * The human display label for an object kind (the Console groups by these). Storage is `Data Store`,
 * distinct from the network kinds. `Kernel` objects are not operator-authored and never appear here.
 */
export function objectKindLabel(kind: ObjectKind): string {
  switch (kind) {
    case 'user':
      return 'User';
    case 'group':
      return 'Group';
    case 'agent':
      return 'Agent';
    case 'service':
      return 'Service';
    case 'server':
      return 'Server';
    case 'application':
      return 'Application';
    case 'uri':
      return 'URI';
    case 'network':
      return 'Network';
    case 'registry_key':
      return 'Registry Key';
    case 'certificate':
      return 'Certificate';
    case 'script':
      return 'Script';
    case 'data_store':
      return 'Data Store';
  }
}
