// packages/design/src/components/ConfirmDialog.tsx -- the confirm dialog shell (F0.2c).
//
// The guard in front of a consequential operator action (revoke, quarantine, legal-hold). Implements the
// ARIA alert-dialog pattern: `role=alertdialog`/`aria-modal`, a title (`aria-labelledby`) + an optional
// description (`aria-describedby`), Escape mapped to cancel (the safe default), and initial focus on the
// cancel action so a stray Enter never confirms a destructive act. Controlled: the parent owns `open`.
// Presentation only -- the parent wires confirm to a real bound op (INV-CONSOLE-NO-STUB).

import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

/** The visual weight of the confirm action; `critical` marks a destructive act (red confirm). */
export type ConfirmTone = 'default' | 'critical';

export interface ConfirmDialogProps {
  /** Whether the dialog is open. When false nothing is rendered. */
  readonly open: boolean;
  /** The question the operator answers; names the dialog for assistive tech. */
  readonly title: string;
  /** Optional supporting detail (consequences, scope); describes the dialog when present. */
  readonly description?: string;
  /** The confirm button label (default "Confirm"). */
  readonly confirmLabel?: string;
  /** The cancel button label (default "Cancel"). */
  readonly cancelLabel?: string;
  /** Confirm-button weight; `critical` for a destructive action. Defaults to `default`. */
  readonly tone?: ConfirmTone;
  /** The operator confirmed the action. */
  readonly onConfirm: () => void;
  /** The operator dismissed the dialog (button, Escape, or scrim). */
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement | null {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel on open: the safe default, so a reflexive Enter/Space does not confirm.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  const confirmClass = tone === 'critical' ? 'fc-btn fc-btn--critical' : 'fc-btn fc-btn--primary';

  return (
    <div className="fc-scrim fc-scrim--center" onKeyDown={onKeyDown}>
      <div className="fc-scrim__catch" aria-hidden="true" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="fc-dialog"
      >
        <h2 id={titleId} className="fc-dialog__title">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="fc-dialog__desc">
            {description}
          </p>
        ) : null}
        <div className="fc-dialog__actions">
          <button ref={cancelRef} type="button" className="fc-btn fc-btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
