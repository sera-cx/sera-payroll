import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Me } from '../types';

interface Session { me: Me; clientId: string | null; setClientId: (id: string) => void; refresh: () => void }
const Ctx = createContext<Session | null>(null);
export const useSession = () => { const s = useContext(Ctx); if (!s) throw new Error('No session'); return s; };

const KEY = 'sp.clientId';

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const q = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 30_000 });
  if (!q.data) return <>{fallback}</>;
  const me = q.data;
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private window */ }
  const clientId = me.user?.clientId ?? stored;
  const setClientId = (id: string) => { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } q.refetch(); };
  return <Ctx.Provider value={{ me, clientId, setClientId, refresh: () => q.refetch() }}>{children}</Ctx.Provider>;
}

/** Operators pick a client in the top bar. Everyone else has one on their user. */
export function useClientId(): string {
  const { clientId } = useSession();
  return clientId ?? '';
}
