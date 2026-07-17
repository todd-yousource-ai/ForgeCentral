// packages/design/src/components/Drawer.tsx -- the right-drawer slide-over shell (F0.2c).
//
// The select-then-act drawer host: every surface reuses one slide-over on the right for entity detail
// (CONSOLE-12 lands the content later; this is the chrome + the a11y contract). Implements the ARIA
// modal-dialog pattern: `role=dialog`/`aria-modal`, a title that names the dialog (`aria-labelledby`),
// Escape-to-close (WCAG 2.1.2 no keyboard trap), and initial focus moved into the panel. Controlled: the
// parent owns `open` and is told to close. Presentation only -- no data, no engine coupling.

import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

export interface DrawerProps {
  /** Whether the drawer is open. When false the drawer is not rendered (honest empty DOM, no hidden panel). */
  readonly open: boolean;
  /** The drawer title; also names the dialog for assistive tech (`aria-labelledby`). */
  readonly title: string;
  /** Asked to close (Escape, the close button, or a scrim click). The parent flips `open`. */
  readonly onClose: () => void;
  /** When provided, a back control renders before the title (e.g. a member detail returns to its container
   * list). Absent = no back affordance. This never closes the drawer; it steps the parent back one view. */
  readonly onBack?: (() => void) | undefined;
  /** The drawer body -- the host slot a surface fills with its detail content. */
  readonly children?: ReactNode;
}

export function Drawer({
  open,
  title,
  onClose,
  onBack,
  children,
}: DrawerProps): ReactElement | null {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus into the panel when it opens so keyboard + screen-reader users land inside the dialog.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fc-scrim" onKeyDown={onKeyDown}>
      <div className="fc-scrim__catch" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fc-drawer">
        <div className="fc-drawer__header">
          {onBack ? (
            <button type="button" className="fc-drawer__back" aria-label="Back" onClick={onBack}>
              {'‹'}
            </button>
          ) : null}
          <h2 id={titleId} className="fc-drawer__title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="fc-drawer__close"
            aria-label="Close"
            onClick={onClose}
          >
            {'×'}
          </button>
        </div>
        <div className="fc-drawer__body">{children}</div>
      </div>
    </div>
  );
}
