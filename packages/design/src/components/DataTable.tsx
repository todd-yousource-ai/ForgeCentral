// packages/design/src/components/DataTable.tsx -- the shared data-table primitive (IP-CONSOLE-09 LG.3a).
//
// The typed, semantic table used by the record surfaces (Logs first; Users / Objects / the Overview lists
// reuse it). Native `<table>` semantics for assistive tech; a horizontal scroll container so wide content
// never forces the page to scroll (the responsive rule). Rows can be made interactive (click / Enter /
// Space activate) for select-then-act drill-in (e.g. a Logs row -> the entity drawer), with an accessible
// per-row label and an optional hover-prefetch hook. It renders exactly the rows it is given -- no
// fetching, no fabrication; an empty set shows the caller's honest empty node. All appearance comes from
// `--fc-*` tokens via the `.fc-table*` classes in styles.ts (no color literals here).
//
// NOT virtualized: the LOG substrate returns a single bounded page today (deep cursor paging is a named
// crdb deferral), so the row count is small and windowing would be premature optimization. Virtualization
// lands with the deep-paging binding, behind this same props shape (no consumer rework).

import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

/** One column: a stable id, a header, and a cell renderer over the row type. */
export interface DataTableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  /** Optional fixed width (a CSS length, e.g. `'9rem'`); default auto. */
  readonly width?: string;
  /** Alignment of the header + cells; `end` for numeric/time columns. Default `start`. */
  readonly align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  /** The accessible table caption (visually hidden; the surface heading is the visible title). */
  readonly caption: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  /** A stable key per row. */
  readonly rowKey: (row: T) => string;
  /** When set, each row is interactive: click / Enter / Space calls this (e.g. open the drawer). */
  readonly onRowActivate?: (row: T) => void;
  /** The accessible label for an interactive row (required, and only used, when `onRowActivate` is set). */
  readonly rowLabel?: (row: T) => string;
  /** Optional hover/focus prefetch for an interactive row (e.g. warm the drawer cache). */
  readonly onRowHover?: (row: T) => void;
  /** Rendered in a single full-width cell when there are no rows (the caller's honest empty state). */
  readonly empty?: ReactNode;
}

/** The shared, typed, semantic data table. Generic over the row type. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  onRowActivate,
  rowLabel,
  onRowHover,
  empty,
}: DataTableProps<T>): ReactElement {
  const interactive = onRowActivate !== undefined;
  return (
    <div className="fc-table__scroll">
      <table className="fc-table">
        <caption className="fc-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={col.align === 'end' ? 'fc-table__cell--end' : undefined}
                style={col.width !== undefined ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="fc-table__empty" colSpan={columns.length}>
                {empty ?? 'No rows.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              const activate = interactive
                ? {
                    tabIndex: 0,
                    'aria-label': rowLabel?.(row),
                    onClick: () => onRowActivate?.(row),
                    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowActivate?.(row);
                      }
                    },
                    ...(onRowHover
                      ? { onMouseEnter: () => onRowHover(row), onFocus: () => onRowHover(row) }
                      : {}),
                  }
                : {};
              return (
                <tr
                  key={key}
                  className={
                    interactive ? 'fc-table__row fc-table__row--interactive' : 'fc-table__row'
                  }
                  {...activate}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={col.align === 'end' ? 'fc-table__cell--end' : undefined}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
