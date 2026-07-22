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
import { Badge, ConfirmDialog, type BadgeVariant } from '@forge/design';
import type { ObjectCard, ObjectDraft, ObjectKind, SelectorKind } from '@forge/contracts';
import { OBJECT_KINDS, objectId, objectKindLabel } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useDrawer } from '../shell/DrawerHost.js';
import { ObjectCommandError, useDeleteObject, useObjectWrite, useObjects } from './useObjects.js';

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

/**
 * The selector form a kind takes (the Create form's input semantics): Network -> CIDR, Group ->
 * group name, everything else -> exact value or path/value glob. The default selector kind seeds the
 * input; the operator can still pick exact vs glob for the value-space kinds.
 */
function defaultSelectorKind(kind: ObjectKind): SelectorKind {
  if (kind === 'network') return 'cidr';
  if (kind === 'group') return 'group_ref';
  return 'glob';
}

/** The selector-value input hint for a kind (guides the operator to the right shape). */
function selectorHint(kind: ObjectKind, selectorKind: SelectorKind): string {
  if (selectorKind === 'cidr') return 'e.g. 10.8.0.0/16';
  if (selectorKind === 'group_ref') return 'the group name (members come from IdAM/Users)';
  if (kind === 'data_store') return 'a locator (s3://bucket) or a path glob (/data/phi/**)';
  if (kind === 'script') return 'a path or path glob (**/backup.ps1)';
  if (kind === 'server') return 'a host name or glob (prod-*)';
  return 'an exact value or a glob (*)';
}

/** The typed failure line for a command form. */
function commandFailure(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof ObjectCommandError) {
    if (error.status === 409) return 'An object with that name already exists.';
    if (error.status === 400)
      return 'The form is incomplete or the selector does not fit the kind.';
    return 'The engine refused the command.';
  }
  return 'The command could not reach the engine.';
}

/** The Create / Edit Object form (O10.3): NO posture control -- an object is a noun. */
function ObjectForm({
  editing,
  onDone,
}: {
  readonly editing: ObjectCard | null;
  readonly onDone: () => void;
}): ReactElement {
  const write = useObjectWrite(editing === null ? 'create' : 'edit');
  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<ObjectKind>(editing?.kind ?? 'server');
  const [selectorKind, setSelectorKind] = useState<SelectorKind>(
    editing?.selectorKind ?? defaultSelectorKind(editing?.kind ?? 'server'),
  );
  const [selectorValue, setSelectorValue] = useState(editing?.selectorValue ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');

  // Changing the kind re-seeds the selector form (Network -> cidr, Group -> group_ref, ...).
  const onKind = (next: ObjectKind): void => {
    setKind(next);
    setSelectorKind(defaultSelectorKind(next));
  };

  const submit = (): void => {
    const draft: ObjectDraft = {
      name: name.trim(),
      kind,
      selectorKind,
      selectorValue: selectorValue.trim(),
      description: description.trim(),
      tags: editing?.tags ?? [],
      lifecycle: editing?.lifecycle ?? 'draft',
    };
    write.mutate(draft, { onSuccess: onDone });
  };
  const failure = commandFailure(write.error);

  return (
    <form
      className="fcx-objects-create"
      aria-label={editing === null ? 'Create an object' : `Edit ${editing.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="fcx-filter">
        Name
        <input
          className="fcx-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={editing !== null}
          required
        />
      </label>
      <label className="fcx-filter">
        Kind
        <select
          className="fcx-select"
          value={kind}
          onChange={(e) => onKind(e.target.value as ObjectKind)}
        >
          {OBJECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {objectKindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="fcx-filter">
        Selector
        <select
          className="fcx-select"
          value={selectorKind}
          onChange={(e) => setSelectorKind(e.target.value as SelectorKind)}
        >
          {(kind === 'network'
            ? (['cidr', 'exact', 'glob'] as const)
            : kind === 'group'
              ? (['group_ref'] as const)
              : (['exact', 'glob'] as const)
          ).map((sk) => (
            <option key={sk} value={sk}>
              {sk}
            </option>
          ))}
        </select>
      </label>
      <label className="fcx-filter">
        Value
        <input
          className="fcx-input"
          value={selectorValue}
          onChange={(e) => setSelectorValue(e.target.value)}
          placeholder={selectorHint(kind, selectorKind)}
          required
        />
      </label>
      <label className="fcx-filter">
        Description
        <input
          className="fcx-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="fcx-btn fcx-btn--primary"
        disabled={write.isPending || name.trim() === '' || selectorValue.trim() === ''}
      >
        {write.isPending ? 'Committing...' : editing === null ? 'Create Object' : 'Save'}
      </button>
      <button type="button" className="fcx-btn" onClick={onDone}>
        Cancel
      </button>
      {failure !== null ? (
        <p role="alert" className="fcx-form-error">
          {failure}
        </p>
      ) : null}
    </form>
  );
}

export function ObjectsSurface(): ReactElement {
  const objects = useObjects();
  const deleteObject = useDeleteObject();
  const drawer = useDrawer();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | ObjectKind>('');
  const [form, setForm] = useState<'closed' | 'add' | ObjectCard>('closed');
  const [confirming, setConfirming] = useState<ObjectCard | null>(null);

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
        <button
          type="button"
          className="fcx-btn fcx-btn--primary"
          onClick={() => setForm((f) => (f === 'add' ? 'closed' : 'add'))}
        >
          + Create Object
        </button>
      </div>

      {form !== 'closed' ? (
        <ObjectForm editing={form === 'add' ? null : form} onDone={() => setForm('closed')} />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming !== null ? `Delete ${confirming.name}?` : ''}
        description="Deleting a catalog object changes no enforcement; a policy that references it must be re-authored on the Policy tab. History is preserved."
        tone="critical"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirming !== null) {
            deleteObject.mutate({ name: confirming.name });
          }
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />

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
                  <article
                    key={o.name}
                    role="listitem"
                    className="fcx-object-card"
                    onMouseEnter={() =>
                      drawer.prefetchEntity({ kind: 'object', id: objectId(o.name) })
                    }
                  >
                    <div className="fcx-object-card__head">
                      <button
                        type="button"
                        className="fcx-object-card__name fcx-btn--link"
                        onClick={() => drawer.openEntity({ kind: 'object', id: objectId(o.name) })}
                        aria-label={`Open the drawer for ${o.name}`}
                      >
                        {o.name}
                      </button>
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
                    <p className="fcx-object-card__actions">
                      <button type="button" className="fcx-btn" onClick={() => setForm(o)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="fcx-btn fcx-btn--danger"
                        onClick={() => setConfirming(o)}
                      >
                        Delete
                      </button>
                    </p>
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
