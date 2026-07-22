// apps/console/src/surfaces/ObjectsSurface.tsx -- the Objects (protected resources) surface (O10.2).
//
// The catalog of the tenant's named objects -- the reusable policy NOUNS (sources and destinations)
// the Policy surface binds -- grouped by ObjectKind, over the real engine registry. NOUN-ONLY: the
// surface offers no apply/enforce/posture control of any kind (operator ruling; the Policy surface is
// the only binder). Objects are declarative: a card shows the DECLARED noun; live members are a drawer
// detail (O10.4). Mock target: the `/objects` prototype -- kind sections of resource cards.
//
// HONESTY RULES (INV-CONSOLE-OBJECTS-NOUN-ONLY):
//   * Every card comes from the engine catalog; the surface fabricates nothing.
//   * The catalog read is bounded AND complete, so search + kind filter narrow a COMPLETE dataset.
//   * No posture/enforce control exists anywhere on the surface.

import { useMemo, useState, type ReactElement } from 'react';
import { Badge, type BadgeVariant } from '@forge/design';
import type { ObjectCard, ObjectKind } from '@forge/contracts';
import { OBJECT_KINDS, objectKindLabel } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useObjects } from './useObjects.js';

/** The selector rendered in its typed form, e.g. `CIDR 10.8.0.0/16` or `glob prod-*`. */
function selectorText(card: ObjectCard): string {
  const label =
    card.selectorKind === 'cidr'
      ? 'CIDR'
      : card.selectorKind === 'group_ref'
        ? 'group'
        : card.selectorKind;
  return `${label} ${card.selectorValue}`;
}

/** A published object reads calm; a draft is a caution chip (it is not yet policy-referenceable). */
function lifecycleVariant(card: ObjectCard): BadgeVariant {
  return card.lifecycle === 'published' ? 'good' : 'caution';
}

export function ObjectsSurface(): ReactElement {
  const objects = useObjects();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | ObjectKind>('');

  const rows = useMemo(() => {
    const all = objects.data ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter(
      (o) =>
        (needle === '' ||
          o.name.toLowerCase().includes(needle) ||
          o.selectorValue.toLowerCase().includes(needle) ||
          o.description.toLowerCase().includes(needle) ||
          o.tags.some((t) => t.toLowerCase().includes(needle))) &&
        (kind === '' || o.kind === kind),
    );
  }, [objects.data, search, kind]);

  // Group the filtered catalog by kind, in the registry order (matching the prototype's sections).
  const grouped = useMemo(() => {
    const by = new Map<ObjectKind, ObjectCard[]>();
    for (const o of rows) {
      const list = by.get(o.kind) ?? [];
      list.push(o);
      by.set(o.kind, list);
    }
    return OBJECT_KINDS.map((k) => ({ kind: k, items: by.get(k) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [rows]);

  const activeFilters = [
    search.trim() !== '' ? `search "${search.trim()}"` : null,
    kind !== '' ? `kind ${kind}` : null,
  ].filter((f): f is string => f !== null);

  return (
    <section className="fcx-surface" aria-labelledby="surface-objects">
      <div className="fcx-surface__header">
        <h2 id="surface-objects" className="fcx-surface__heading">
          Objects
        </h2>
      </div>

      <div className="fcx-surface__controls">
        <input
          type="search"
          className="fcx-input"
          placeholder="Search objects..."
          aria-label="Search objects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="fcx-filter">
          Kind
          <select
            className="fcx-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as '' | ObjectKind)}
          >
            <option value="">All</option>
            {OBJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {objectKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {objects.isLoading ? (
        <LoadingState label="Loading the object catalog" />
      ) : objects.isError ? (
        <ErrorState
          title="Could not load the object catalog."
          onRetry={() => void objects.refetch()}
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No objects match"
          hint={
            activeFilters.length > 0
              ? `No object matches ${activeFilters.join(', ')}.`
              : 'No objects have been registered yet.'
          }
        />
      ) : (
        <div className="fcx-objects">
          {grouped.map((group) => (
            <section
              key={group.kind}
              className="fcx-objects-group"
              aria-label={objectKindLabel(group.kind)}
            >
              <h3 className="fcx-surface__subheading">{objectKindLabel(group.kind)}</h3>
              <div className="fcx-objects-grid" role="list">
                {group.items.map((o) => (
                  <article key={o.name} role="listitem" className="fcx-object-card">
                    <div className="fcx-object-card__head">
                      <h4 className="fcx-object-card__name">{o.name}</h4>
                      <Badge variant={lifecycleVariant(o)}>{o.lifecycle}</Badge>
                    </div>
                    <p className="fcx-object-card__selector">{selectorText(o)}</p>
                    <p className="fcx-object-card__description">
                      {o.description === '' ? '--' : o.description}
                    </p>
                    {o.tags.length > 0 ? (
                      <p className="fcx-object-card__tags">
                        {o.tags.map((t) => (
                          <Badge key={t} variant="neutral">
                            {t}
                          </Badge>
                        ))}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
