// packages/design/src/components/DisabledReason.tsx -- why a control is unavailable (GD.13).
//
// A disabled control never leaves the operator guessing: it names this line with `aria-describedby`,
// so the reason is shown beside it and read with it (INV-GUIDE-DISABLED-EXPLAINED). The caller supplies
// the words and, where one exists, a link to the cause (a setting, a tab or a guide section).

import type { ReactElement, ReactNode } from 'react';

export interface DisabledReasonProps {
  /** The id the disabled control references with `aria-describedby`. */
  readonly id: string;
  /** Why the control is unavailable, and what would make it available. */
  readonly children: ReactNode;
}

export function DisabledReason({ id, children }: DisabledReasonProps): ReactElement {
  return (
    <span id={id} className="fc-disabled-reason">
      {children}
    </span>
  );
}
