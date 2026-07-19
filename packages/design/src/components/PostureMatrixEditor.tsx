// packages/design/src/components/PostureMatrixEditor.tsx -- the per-domain posture editor (V2.5).
//
// The heart of zone authoring: one row per governed object domain, showing what this zone SETS against
// what would actually APPLY once the ancestor chain composes over it (tighten-only, deny wins). The
// operator edits the left column; the right column previews the result live, so the consequence of an edit
// is visible before it is committed.
//
// THE FLOOR IS NOT EDITABLE. A row the engine flagged as a read-only catastrophic floor renders its
// control disabled and labelled: the engine pins those domains to `deny` and refuses any spec that relaxes
// one, so offering an editable control would be offering an action that cannot succeed. The lock comes
// from the ENGINE's per-row flag, never a table in this component -- if the engine stops flooring a domain,
// this editor unlocks it with no code change.
//
// Presentation only: the parent owns the rows and the composition (INV-CONSOLE-NO-STUB), so the preview
// here is whatever the caller computed, and the engine recomposes and re-validates on commit regardless.

import type { ReactElement } from 'react';

/** The two zone-level default postures. Mirrors the contract's `VtzPosture` without importing it. */
export type PostureValue = 'deny' | 'permit-deny-risky';

/** One editable row: the domain, what this zone set, what would apply, and whether it is floored. */
export interface PostureRow {
  readonly domain: string;
  /** The posture this zone itself sets (the editable value). */
  readonly own: PostureValue;
  /** The composed result once ancestors apply; equal to `own` when nothing above tightens it. */
  readonly effective: PostureValue;
  /** The engine's read-only catastrophic-floor flag. A floored row cannot be edited. */
  readonly floor: boolean;
}

export interface PostureMatrixEditorProps {
  readonly rows: readonly PostureRow[];
  /** Change one domain's OWN posture. Never called for a floored row. */
  readonly onChange: (domain: string, posture: PostureValue) => void;
  /** Disable every control (e.g. while a commit is in flight). */
  readonly disabled?: boolean;
  /** Names the table for assistive tech. */
  readonly caption: string;
}

/** The human label for a posture value (the control's option text and the preview's cell). */
export function postureText(posture: PostureValue): string {
  return posture === 'deny' ? 'Deny' : 'Permit, deny risky';
}

export function PostureMatrixEditor({
  rows,
  onChange,
  disabled = false,
  caption,
}: PostureMatrixEditorProps): ReactElement {
  return (
    <table className="fc-posture-matrix">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Domain</th>
          <th scope="col">This zone sets</th>
          <th scope="col">Effective</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const tightened = row.effective !== row.own;
          return (
            <tr
              key={row.domain}
              className={row.floor ? 'fc-posture-matrix__row--floor' : undefined}
            >
              <th scope="row">{row.domain}</th>
              <td>
                {row.floor ? (
                  // Locked by the engine. Rendered as static text plus an explicit reason, so the lock
                  // reads as a platform guarantee rather than a control that mysteriously does nothing.
                  <span className="fc-posture-matrix__locked">
                    {postureText(row.own)}
                    <span className="fc-posture-matrix__lock-note">Locked: catastrophic floor</span>
                  </span>
                ) : (
                  <select
                    className="fc-posture-matrix__select"
                    aria-label={`Posture for ${row.domain}`}
                    value={row.own}
                    disabled={disabled}
                    onChange={(e) => onChange(row.domain, e.target.value as PostureValue)}
                  >
                    <option value="deny">Deny</option>
                    <option value="permit-deny-risky">Permit, deny risky</option>
                  </select>
                )}
              </td>
              <td>
                {postureText(row.effective)}
                {tightened ? (
                  <span className="fc-posture-matrix__inherited">Tightened by an ancestor</span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
