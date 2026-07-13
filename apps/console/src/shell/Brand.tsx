import type { ReactElement } from 'react';
import { Badge } from '@forge/design';

// The YouSource + ForgeCentral brand marks + the environment badge (the top of the rail and the login
// card). The marks are the real committed brand assets (docs/assets), served from /public. The env badge
// names the deployment so an operator never confuses production with a lab; the environment comes from a
// build-time value, defaulting to development.

function envName(): string {
  const value = import.meta.env.VITE_FC_ENV;
  return value !== undefined && value.length > 0 ? value : 'development';
}

/** The YouSource torus + wordmark (the company brand). Shown on the rail header + the login card. */
export function YouSourceLogo({ className }: { readonly className?: string }): ReactElement {
  return (
    <img
      className={className ?? 'fcx-logo'}
      src="/yousource-logo.png"
      alt="YouSource.ai"
      decoding="async"
    />
  );
}

/** The ForgeCentral (Forge) shield mark. Decorative next to the "ForgeCentral" wordmark. */
export function ForgeMark({ size = 56 }: { readonly size?: number }): ReactElement {
  return (
    <img
      className="fcx-forge-mark"
      src="/forge.png"
      alt=""
      width={size}
      height={size}
      decoding="async"
    />
  );
}

/** The deployment environment chip. Non-production environments read as caution. */
export function EnvBadge(): ReactElement {
  const env = envName();
  const variant = env === 'production' ? 'good' : 'caution';
  return <Badge variant={variant}>{env}</Badge>;
}
