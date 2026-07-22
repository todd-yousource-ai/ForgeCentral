// packages/contracts/test/objects.test.ts -- IP-CONSOLE-10 O10.1 tier-1 tests for the Objects contract.
//
// Proves the O10.1 slice of INV-CONSOLE-OBJECTS-NOUN-ONLY: every Objects view model is a projection
// of the live crdb wire DTOs (a drifted engine field is a compile error in these fixtures), the enum
// narrowings are CLOSED (an unknown kind/selector/lifecycle tag collapses the projection), NO posture
// field exists anywhere, and the declarative/honest-empty member contract holds.

import { describe, expect, it } from 'vitest';

import {
  objectKindLabel,
  toObjectCard,
  toObjectCatalog,
  toObjectDetail,
  toObjectMutation,
  toWireObjectSpec,
} from '../src/index.js';
import type { ObjectDraft, WireObjectDetail, WireObjectRecord } from '../src/index.js';

const ipObject = (overrides: Partial<WireObjectRecord> = {}): WireObjectRecord => ({
  name: 'corp-subnet',
  kind: 'network',
  selector_kind: 'cidr',
  selector_value: '10.8.0.0/16',
  attributes: [],
  description: 'the corp /16',
  tags: ['PHI'],
  lifecycle: 'published',
  ...overrides,
});

const dataStore = (): WireObjectRecord => ({
  name: 'phi-tree',
  kind: 'data_store',
  selector_kind: 'glob',
  selector_value: '/data/phi/**',
  attributes: [],
  description: 'the PHI folder tree',
  tags: ['PHI'],
  lifecycle: 'draft',
});

describe('object cards project the typed selector and carry no posture field', () => {
  it('projects a Network+Cidr object with its typed selector', () => {
    const card = toObjectCard(ipObject());
    expect(card).not.toBeNull();
    expect(card?.kind).toBe('network');
    expect(card?.selectorKind).toBe('cidr');
    expect(card?.selectorValue).toBe('10.8.0.0/16');
    expect(card?.tags).toEqual(['PHI']);
    expect(card?.lifecycle).toBe('published');
  });

  it('projects a DataStore object (data at rest), the storage kind', () => {
    const card = toObjectCard(dataStore());
    expect(card?.kind).toBe('data_store');
    expect(objectKindLabel('data_store')).toBe('Data Store');
    expect(card?.selectorKind).toBe('glob');
  });

  it('carries NO posture/enforcement field on any card (noun-only is structural)', () => {
    const card = toObjectCard(ipObject());
    for (const key of Object.keys(card ?? {})) {
      for (const banned of ['posture', 'action', 'enforce', 'disposition', 'trust']) {
        expect(key.toLowerCase()).not.toContain(banned);
      }
    }
  });
});

describe('enum narrowing is closed (fail-closed on an unknown engine tag)', () => {
  it('refuses an unknown kind, selector form, or lifecycle rather than guessing', () => {
    expect(toObjectCard(ipObject({ kind: 'quantum' }))).toBeNull();
    expect(toObjectCard(ipObject({ selector_kind: 'regexp' }))).toBeNull();
    expect(toObjectCard(ipObject({ lifecycle: 'archived' }))).toBeNull();
  });

  it('one malformed record collapses the whole catalog, not just its card', () => {
    const cards = toObjectCatalog({ objects: [ipObject(), ipObject({ kind: 'quantum' })] });
    expect(cards).toBeNull();
  });

  it('an empty tenant projects an honest empty catalog', () => {
    expect(toObjectCatalog({ objects: [] })).toEqual([]);
  });
});

describe('detail resolution is declarative + honest-empty', () => {
  it('an existing object carries its read-time members', () => {
    const detail: WireObjectDetail = { record: ipObject(), members: ['10.8.0.9:443'] };
    const view = toObjectDetail(detail);
    expect(view?.object?.name).toBe('corp-subnet');
    expect(view?.members).toEqual(['10.8.0.9:443']);
  });

  it('a declared object with no live match carries empty members, never an error', () => {
    const view = toObjectDetail({ record: dataStore(), members: [] });
    expect(view?.object?.kind).toBe('data_store');
    expect(view?.members).toEqual([]);
  });

  it('an absent object is object:null (unknown name), not a fabricated record', () => {
    const view = toObjectDetail({ record: null, members: [] });
    expect(view?.object).toBeNull();
    expect(view?.members).toEqual([]);
  });
});

describe('command shapes', () => {
  it('a draft round-trips to the wire spec with absent tags omitted', () => {
    const draft: ObjectDraft = {
      name: 'prod-servers',
      kind: 'server',
      selectorKind: 'glob',
      selectorValue: 'prod-*',
      description: 'the prod pool',
      tags: [],
      lifecycle: 'draft',
    };
    const spec = toWireObjectSpec(draft);
    expect(spec).toEqual({
      name: 'prod-servers',
      kind: 'server',
      selector_kind: 'glob',
      selector_value: 'prod-*',
      description: 'the prod pool',
      lifecycle: 'draft',
    });
    expect('tags' in spec).toBe(false);
  });

  it('a mutation ack carries the mutated name', () => {
    expect(toObjectMutation({ name: 'corp-subnet' })).toEqual({ name: 'corp-subnet' });
  });
});
