import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { api } from '../api';
import { useClientId } from '../lib/session';
import { useToast } from '../lib/toast';
import type { RunRecord, RunView } from '../types';

export function useClient() { const c = useClientId(); return useQuery({ queryKey: ['client', c], queryFn: () => api.client(c), enabled: !!c }); }
export function usePeople(q = '') { const c = useClientId(); return useQuery({ queryKey: ['people', c, q], queryFn: () => api.people(c, q), enabled: !!c }); }
export function useRun() {
  const c = useClientId();
  return useQuery({ queryKey: ['run', c], queryFn: () => api.run(c), enabled: !!c });
}
export function useRuns() { const c = useClientId(); return useQuery({ queryKey: ['runs', c], queryFn: () => api.runs(c), enabled: !!c }); }
export function useRunRecord(id: string | null, live = false) {
  const c = useClientId();
  return useQuery({
    queryKey: ['runRecord', c, id],
    queryFn: () => api.runRecord(c, id!),
    enabled: !!c && !!id,
    refetchInterval: (q) => (live && isMoving(q.state.data) ? 1500 : false),
  });
}
export function isMoving(r?: RunRecord | null) {
  return !!r && r.items.some((i) => i.payouts.some((p) => p.state === 'queued' || p.state === 'running'));
}
export function useOutbox() { const c = useClientId(); return useQuery({ queryKey: ['outbox', c], queryFn: () => api.outbox(c), enabled: !!c }); }

/** Mutation that refetches the given query roots after success and toasts errors. */
export function useAction<V, R>(fn: (clientId: string, v: V) => Promise<R>, invalidate: string[], opts: UseMutationOptions<R, Error, V> = {}) {
  const c = useClientId();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<R, Error, V>({
    mutationFn: (v) => fn(c, v),
    ...opts,
    onSuccess: async (...args) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      await (opts.onSuccess as ((...a: unknown[]) => unknown) | undefined)?.(...args);
    },
    onError: (...args) => { toast(args[0].message); (opts.onError as ((...a: unknown[]) => unknown) | undefined)?.(...args); },
  });
}

export function useRunAction<V>(fn: (clientId: string, v: V) => Promise<RunView>) {
  const c = useClientId();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<RunView, Error, V>({
    mutationFn: (v) => fn(c, v),
    onSuccess: (d) => { qc.setQueryData(['run', c], d); qc.invalidateQueries({ queryKey: ['client', c] }); },
    onError: (e) => toast(e.message),
  });
}
