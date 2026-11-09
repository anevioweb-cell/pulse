import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { AppProviders } from '@/app/providers';
import { registerServiceWorker } from '@/app/pwa/register';
import { ThemeProvider } from '@/shared/theme';
import '@/app/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AppProviders>
        <App />
      </AppProviders>
    </ThemeProvider>
  </StrictMode>,
);

// After the first render, so the worker never delays it. Failure leaves an online-only app.
void registerServiceWorker();
