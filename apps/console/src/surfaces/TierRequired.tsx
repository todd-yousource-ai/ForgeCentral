// apps/console/src/surfaces/TierRequired.tsx -- the state a read shows when the operator's tier is
// below the one the engine serves it to (GD.13, INV-GUIDE-DISABLED-EXPLAINED): what is withheld, from
// whom, and a link to who can change configuration.

import type { ReactElement } from 'react';

import { GuideLink } from '../guide/GuideLink.js';
import { EmptyState } from '../states/States.js';

export function TierRequired({ what }: { readonly what: string }): ReactElement {
  return (
    <EmptyState
      title="Admin or SecurityAudit tier required"
      hint={`The engine serves ${what} to Admin and SecurityAudit operators only.`}
      action={<GuideLink section="cfg-who">Who can configure what</GuideLink>}
    />
  );
}
