import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { ToastProvider } from '../lib/toast';
import { SessionProvider } from '../lib/session';
import { wagmiConfig } from '../wallet';
import * as S from '../mocks/state';

export function renderApp(ui: ReactNode, { route = '/', user }: { route?: string; user?: string } = {}) {
  if (user) S.login(user);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ToastProvider>
            <SessionProvider fallback={<p>loading session</p>}>{ui}</SessionProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </WagmiProvider>,
  );
}
