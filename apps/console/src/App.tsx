import type { ReactElement } from 'react';

import { Login } from './auth/Login.js';
import { useSession } from './auth/useSession.js';
import { LiveProvider } from './live/LiveProvider.js';
import { Shell } from './shell/Shell.js';
import { ErrorState, LoadingState } from './states/States.js';

// The app root inside the providers (Router + QueryClient are in main.tsx). It is the auth gate: while the
// session is resolving it shows the loading state; unauthenticated -> the login screen; a hard session
// error -> the explicit error state; authenticated -> the shell. The client gate is UX only; every read is
// re-authorized engine-side under the operator Principal (INV-CONSOLE-ENGINE-AUTHZ).

export function App(): ReactElement {
  const { operator, isLoading, isError, refetch } = useSession();

  if (isLoading) {
    return (
      <main className="fcx-boot" aria-label="Starting the Console">
        <LoadingState label="Checking your session" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="fcx-boot">
        <ErrorState
          title="Could not verify your session."
          code="SessionCheckFailed"
          onRetry={refetch}
        />
      </main>
    );
  }

  if (operator === null || operator === undefined) {
    return <Login />;
  }

  return (
    <LiveProvider>
      <Shell operator={operator} />
    </LiveProvider>
  );
}
