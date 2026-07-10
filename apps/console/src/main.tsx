import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App.js';
import { createQueryClient } from './query/client.js';
import { installTheme } from './theme.js';
import './shell.css';

// The SPA entry: install the design theme, mount the app inside the Router + QueryClient providers. The
// live-store provider is mounted per authenticated session (in App), not here, so the login screen holds
// no live state.

installTheme();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Console root element (#root) not found');
}

const queryClient = createQueryClient();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
