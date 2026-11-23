import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { wagmiConfig } from './wallet';
import { ToastProvider } from './lib/toast';
import './styles.css';

async function boot() {
  if (import.meta.env.VITE_MOCK_API === '1') {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={qc}>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>,
  );
}
void boot();
