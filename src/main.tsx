import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { AppProviders } from '@/app/providers';
import { registerServiceWorker } from '@/app/pwa/register';
import { SessionController } from '@/app/session/session-controller';
import { ThemeProvider } from '@/shared/theme';
import '@/app/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

// Builds the API, QueryClient and live session for the stored mode (Demo by default) and starts
// them outside React, so StrictMode's double effects cannot start anything twice.
const session = new SessionController();
session.start();

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AppProviders controller={session}>
        <App />
      </AppProviders>
    </ThemeProvider>
  </StrictMode>,
);

// After the first render, so the worker never delays it. Failure leaves an online-only app.
void registerServiceWorker();
