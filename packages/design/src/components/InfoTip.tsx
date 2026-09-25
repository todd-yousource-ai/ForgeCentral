// packages/design/src/components/InfoTip.tsx -- the accessible toggle-tip and field hint (GD.12).
//
// `InfoTip` is a toggle-tip, not a hover tooltip: a real button that opens its note on click or
// keyboard, so it works on touch and for keyboard and screen-reader users (WCAG 1.4.13, 2.1.1). The note
// renders into a polite live region, so opening it announces the text; Escape or a second press closes
// it and focus stays on the button. `FieldHint` is the always-visible constraint line under a field
// (its format, default and limits); the field names it with `aria-describedby` so the constraint is
// read with the field, never only on a hover.

import { useId, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

export interface InfoTipProps {
  /** What the tip explains (names the button: "About <label>"). */
  readonly label: string;
  /** The help text shown when the tip is open. */
  readonly children: ReactNode;
}

export function InfoTip({ label, children }: InfoTipProps): ReactElement {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <span className="fc-infotip" onKeyDown={onKeyDown}>
      <button
        type="button"
        className="fc-infotip__button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span id={noteId} role="status" className="fc-infotip__note">
        {open ? children : null}
      </span>
    </span>
  );
}

export interface FieldHintProps {
  /** The id the field references with `aria-describedby`. */
  readonly id: string;
  /** The constraint line: format, default and limits. */
  readonly children: ReactNode;
}

export function FieldHint({ id, children }: FieldHintProps): ReactElement {
  return (
    <span id={id} className="fc-field-hint">
      {children}
    </span>
  );
}
