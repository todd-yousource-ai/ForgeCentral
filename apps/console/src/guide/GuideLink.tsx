// apps/console/src/guide/GuideLink.tsx -- a link from a control to the guide section that explains it
// (GD.13, INV-GUIDE-DISABLED-EXPLAINED).
//
// It opens the ReadMe at the section (`/settings?tab=readme#<section>`). The contract test holds every
// section named here to one the generated guide contains, so a renamed section cannot leave a dead link.

import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function GuideLink({
  section,
  label,
  children,
}: {
  readonly section: string;
  /** A fuller accessible name when the visible text is short (for example "why"). */
  readonly label?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Link
      to={{ pathname: '/settings', search: '?tab=readme', hash: section }}
      data-guide={section}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
