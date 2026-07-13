import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { EnvBadge, ForgeMark, YouSourceLogo } from '../shell/Brand.js';
import { pollLogin, startLogin } from './api.js';
import type { LoginStart } from './api.js';
import { SESSION_QUERY_KEY } from './useSession.js';

// The federated OIDC device login (F0.5a). "Sign in" starts a device flow; the operator completes MFA at
// the verification URI while the SPA polls at the IdP-supplied interval. On completion the verified
// operator seeds the session query and the shell renders. No token is held here; the BFF sets the session
// cookie. Errors are explicit (expired / failed), never a silent hang.

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'awaiting'; readonly start: LoginStart }
  | { readonly kind: 'error'; readonly message: string };

export function Login(): ReactElement {
  const client = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(
    (start: LoginStart): void => {
      const tick = async (): Promise<void> => {
        const result = await pollLogin(start.loginId);
        if (!alive.current) return;
        switch (result.status) {
          case 'pending':
            timer.current = window.setTimeout(() => void tick(), start.intervalSecs * 1000);
            return;
          case 'complete':
            client.setQueryData(SESSION_QUERY_KEY, result.operator);
            return;
          case 'expired':
            setPhase({ kind: 'error', message: 'The sign-in request expired. Try again.' });
            return;
          case 'error':
            setPhase({ kind: 'error', message: 'Sign-in failed. Try again.' });
            return;
        }
      };
      timer.current = window.setTimeout(() => void tick(), start.intervalSecs * 1000);
    },
    [client],
  );

  const begin = useCallback((): void => {
    setPhase({ kind: 'starting' });
    void (async (): Promise<void> => {
      try {
        const start = await startLogin();
        if (!alive.current) return;
        setPhase({ kind: 'awaiting', start });
        poll(start);
      } catch {
        if (alive.current) {
          setPhase({ kind: 'error', message: 'Could not reach the sign-in service.' });
        }
      }
    })();
  }, [poll]);

  return (
    <main className="fcx-login" aria-labelledby="fcx-login-title">
      <div className="fcx-login__card">
        <YouSourceLogo className="fcx-login__logo" />
        <div className="fcx-login__product">
          <ForgeMark size={64} />
          <h1 id="fcx-login-title" className="fcx-login__title">
            ForgeCentral
          </h1>
        </div>
        <EnvBadge />
        {phase.kind === 'awaiting' ? (
          <div className="fcx-login__await" role="status">
            <p className="fcx-login__lead">Enter this code at the sign-in page to continue:</p>
            <p className="fcx-login__code">{phase.start.userCode}</p>
            <a
              className="fcx-btn fcx-btn--primary"
              href={phase.start.verificationUriComplete ?? phase.start.verificationUri}
              target="_blank"
              rel="noreferrer"
            >
              Open sign-in page
            </a>
            <p className="fcx-login__hint">Waiting for you to finish signing in…</p>
          </div>
        ) : (
          <div className="fcx-login__start">
            {phase.kind === 'error' ? (
              <p className="fcx-login__error" role="alert">
                {phase.message}
              </p>
            ) : null}
            <button
              type="button"
              className="fcx-btn fcx-btn--primary"
              onClick={begin}
              disabled={phase.kind === 'starting'}
            >
              {phase.kind === 'starting' ? 'Starting…' : 'Sign in'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
