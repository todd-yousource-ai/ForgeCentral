import type { ReactElement } from 'react';
import { Badge } from '@forge/design';

// The YouSource mark + the environment badge (the top of the rail and the login card). The mark is a
// token-colored inline SVG (brand teal); the env badge names the deployment so an operator never confuses
// production with a lab. The environment comes from a build-time value, defaulting to development.

function envName(): string {
  const value = import.meta.env.VITE_FC_ENV;
  return value !== undefined && value.length > 0 ? value : 'development';
}

/** The brand hex mark (honeycomb nod), colored by the brand token. */
export function Mark({ size = 28 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      className="fcx-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="YouSource"
      fill="none"
    >
      <path
        d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z"
        stroke="var(--fc-color-brand-primary)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 7l4.33 2.5v5L12 17l-4.33-2.5v-5L12 7z"
        fill="var(--fc-color-brand-primary)"
        opacity="0.9"
      />
    </svg>
  );
}

/** The deployment environment chip. Non-production environments read as caution. */
export function EnvBadge(): ReactElement {
  const env = envName();
  const variant = env === 'production' ? 'good' : 'caution';
  return <Badge variant={variant}>{env}</Badge>;
}
