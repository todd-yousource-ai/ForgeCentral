import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { Badge } from '@forge/design';

import { useLive } from '../live/LiveProvider.js';
import { useLogout } from '../auth/useSession.js';
import type { OperatorDto } from '../auth/api.js';

// The top bar: the current destination title (left), the live indicator (center-right), and the account
// menu (right). The brand (logo + environment badge) lives at the top of the left rail, not here. The live
// indicator reflects the live-store: with F0.6 deferred it reads "not live" rather than a fake "Live" pill
// (INV-CONSOLE-LIVE: honest freshness).

function LiveIndicator(): ReactElement {
  const live = useLive();
  if (live.status === 'live') {
    return <Badge variant="good">Live</Badge>;
  }
  const variant = live.status === 'stale' ? 'caution' : 'neutral';
  return (
    <span title={live.reason}>
      <Badge variant={variant}>Not live</Badge>
    </span>
  );
}

function AccountMenu({ operator }: { readonly operator: OperatorDto }): ReactElement {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const logout = useLogout();
  const name = operator.email ?? operator.subject;

  return (
    <div className="fcx-account">
      <button
        type="button"
        className="fcx-account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fcx-account__name">{name}</span>
        <Badge variant="info">{operator.tier}</Badge>
      </button>
      {open ? (
        <div className="fcx-account__menu" id={menuId} role="menu">
          <p className="fcx-account__meta" role="presentation">
            {operator.subject}
          </p>
          <button type="button" className="fcx-account__item" role="menuitem" onClick={logout}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface TopBarProps {
  readonly title: string;
  readonly operator: OperatorDto;
}

export function TopBar({ title, operator }: TopBarProps): ReactElement {
  return (
    <header className="fcx-topbar">
      <h1 className="fcx-topbar__title">{title}</h1>
      <div className="fcx-topbar__right">
        <LiveIndicator />
        <AccountMenu operator={operator} />
      </div>
    </header>
  );
}
