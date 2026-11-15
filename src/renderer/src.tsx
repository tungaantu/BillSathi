import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari';
import './styles/tokens.css';
import './styles/controls.css';
import './styles/forms.css';
import './styles/shell.css';
import './styles/dashboard.css';
import './styles/help.css';
import './styles/onboarding.css';
import './styles/responsive.css';
import './styles/masters.css';
import './styles/sales.css';
import './styles/safety.css';
import './i18n';
import { AppProvider } from './app/state';
import { App } from './app/App';
import { ToastProvider } from './components/ui/Toast';
import { LockGate } from './features/safety';
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppProvider>
          <LockGate>
            <App />
          </LockGate>
        </AppProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
