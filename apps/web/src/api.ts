import type * as T from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiError'; }
}

async function call<R>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<R> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    credentials: 'include',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as R;
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let code = 'http_error', message = res.statusText || 'Request failed';
    if (ct.includes('json')) { try { const j = await res.json(); code = j?.error?.code ?? code; message = j?.error?.message ?? message; } catch { /* ignore */ } }
    throw new ApiError(res.status, code, message);
  }
  if (ct.includes('json')) return (await res.json()) as R;
  return (await res.text()) as R;
}

export const get = <R>(p: string) => call<R>('GET', p);
export const post = <R>(p: string, b?: unknown, h?: Record<string, string>) => call<R>('POST', p, b ?? {}, h);
export const patch = <R>(p: string, b: unknown) => call<R>('PATCH', p, b);
export const put = <R>(p: string, b: unknown) => call<R>('PUT', p, b);
export const del = <R>(p: string) => call<R>('DELETE', p);

export const url = (p: string) => `${BASE}/v1${p}`;
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export const api = {
  me: () => get<T.Me>('/auth/me'),
  demoUsers: () => get<T.DemoUser[]>('/auth/demo/users'),
  demoLogin: (userId: string) => post<void>('/auth/demo', { userId }),
  logout: () => post<void>('/auth/logout'),
  magicLink: (email: string) => post<void>('/auth/magic-link', { email }),

  client: (c: string) => get<T.Client>(`/clients/${c}`),
  settings: (c: string, s: Partial<T.Settings>) => patch<T.Settings>(`/clients/${c}/settings`, s),
  people: (c: string, q = '') => get<T.Person[]>(`/clients/${c}/people${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addPerson: (c: string, b: { name: string; type: string; monthlyPay: string; currency: string; email?: string }) => post<T.Person>(`/clients/${c}/people`, b),
  editPerson: (c: string, id: string, b: Partial<Pick<T.Person, 'name' | 'type' | 'monthlyPay' | 'email'>>) => patch<T.Person>(`/clients/${c}/people/${id}`, b),
  removePerson: (c: string, id: string) => del<void>(`/clients/${c}/people/${id}`),
  importPeople: (c: string, text: string) => post<{ imported: number; rejected: { line: number; reason: string }[]; message: string; people: T.Person[] }>(`/clients/${c}/people/import`, { text }),
  invite: (c: string, id: string) => post<{ url: string; expiresAt: string }>(`/clients/${c}/people/${id}/invite`),
  setAddress: (c: string, id: string, address: string) => put<T.Person>(`/clients/${c}/people/${id}/address`, { address }),
  lock: (c: string, id: string, locked: boolean) => post<T.Person>(`/clients/${c}/people/${id}/address/lock`, { locked }),
  approvePending: (c: string, id: string) => post<T.Person>(`/clients/${c}/people/${id}/address/approve`),
  rejectPending: (c: string, id: string) => post<T.Person>(`/clients/${c}/people/${id}/address/reject`),
  testPayment: (c: string, id: string) => post<T.Person>(`/clients/${c}/people/${id}/address/test-payment`),

  run: (c: string) => get<T.RunView>(`/clients/${c}/runs/current`),
  nextRun: (c: string) => post<T.RunView>(`/clients/${c}/runs/current/next`),
  patchRun: (c: string, b: { fundingSource?: string; funded?: boolean }) => patch<T.RunView>(`/clients/${c}/runs/current`, b),
  addOneOff: (c: string, b: { personId: string; amount: string; currency: string; kind: string }) => post<T.RunView>(`/clients/${c}/runs/current/one-offs`, b),
  removeOneOff: (c: string, id: string) => del<T.RunView>(`/clients/${c}/runs/current/one-offs/${id}`),
  skip: (c: string, personId: string, skipped: boolean) => post<T.RunView>(`/clients/${c}/runs/current/skip`, { personId, skipped }),
  fundingInstructions: (c: string) => post<T.Deposit>(`/clients/${c}/runs/current/funding/instructions`),
  fundingConfirm: (c: string, reference: string) => post<T.RunView>(`/clients/${c}/runs/current/funding/confirm`, { reference }),
  topup: (c: string) => post<T.RunView>(`/clients/${c}/runs/current/topup`),
  submit: (c: string, runId: string) => post<T.RunView>(`/clients/${c}/runs/${runId}/submit`),
  unsubmit: (c: string, runId: string) => post<T.RunView>(`/clients/${c}/runs/${runId}/unsubmit`),
  approve: (c: string, runId: string, b: { signature: string; signerAddress: string | null; simulateFailure?: boolean }) => post<T.RunRecord>(`/clients/${c}/runs/${runId}/approve`, b, { 'Idempotency-Key': newKey() }),
  multisigSign: (c: string, runId: string, b: { signature: string; signerAddress: string }) => post<T.RunView>(`/clients/${c}/runs/${runId}/multisig/sign`, b),
  submitSwap: (c: string, runId: string, payoutId: string, b: { signature: string; permitSignature?: string | null; permitDeadline?: number | null }) => post<void>(`/clients/${c}/runs/${runId}/swaps/${payoutId}/submit`, b),
  submitDisburse: (c: string, runId: string, txHash: string) => post<void>(`/clients/${c}/runs/${runId}/disburse`, { txHash }),
  runs: (c: string) => get<T.RunRecord[]>(`/clients/${c}/runs`),
  runRecord: (c: string, id: string) => get<T.RunRecord>(`/clients/${c}/runs/${id}`),
  exportCsv: (c: string, id: string) => get<string>(`/clients/${c}/runs/${id}/export`),
  retry: (c: string, payoutId: string) => post<T.PayoutView>(`/clients/${c}/payouts/${payoutId}/retry`, {}, { 'Idempotency-Key': newKey() }),
  outbox: (c: string) => get<T.OutboxItem[]>(`/clients/${c}/outbox`),

  myself: () => get<T.MeView>('/me'),
  setPayout: (b: { payoutPrimary?: string; payoutSecondary?: string | null; splitPercent?: number }) => patch<T.Person>('/me/payout', b),
  challenge: (address: string) => get<{ message: string; nonce: string }>(`/me/address/challenge?address=${address}`),
  signAddress: (b: { address: string; signature: string; nonce: string }) => post<T.Person>('/me/address/sign', b),
  pasteAddress: (address: string) => post<T.Person>('/me/address/paste', { address }),
  cancelPending: () => post<T.Person>('/me/address/cancel'),
  startVerification: () => post<{ url: string }>('/me/verification/start'),
  myPayslips: () => get<T.MyPayslip[]>('/me/payslips'),
  disclose: (runId: string, fields: string[]) => get<T.Disclosure>(`/me/payslips/${runId}/disclose?fields=${fields.join(',')}`),
  invite_: (token: string) => get<T.InviteInfo>(`/invite/${token}`),
  acceptInvite: (token: string, email: string) => post<void>(`/invite/${token}/accept`, { email }),

  operator: () => get<T.OperatorView>('/operator'),
  addClient: (b: { name: string; feePercent: string }) => post<T.OperatorClient>('/operator/clients', b),
  editClient: (id: string, b: Partial<Pick<T.OperatorClient, 'name' | 'feePercent' | 'treasuryWallet'>>) => patch<T.OperatorClient>(`/operator/clients/${id}`, b),
  ramps: () => get<T.Ramps>('/operator/ramps'),
  setRamp: (ccy: string, b: { onRamp?: boolean; offRamp?: boolean }) => patch<T.Ramps>(`/operator/ramps/${ccy}`, b),
  plugins: () => get<T.PluginView[]>('/operator/plugins'),
  setPlugin: (ccy: string, enabled: boolean) => patch<T.PluginView[]>(`/operator/plugins/${ccy}`, { enabled }),
  apiKeys: () => get<T.ApiKey[]>('/operator/api-keys'),
  addApiKey: (label: string) => post<T.ApiKey>('/operator/api-keys', { label }),
  delApiKey: (id: string) => del<void>(`/operator/api-keys/${id}`),
  webhooks: () => get<T.Webhook[]>('/operator/webhooks'),
  addWebhook: (b: { url: string; events: string[] }) => post<T.Webhook>('/operator/webhooks', b),
  delWebhook: (id: string) => del<void>(`/operator/webhooks/${id}`),
  deliveries: (id: string) => get<T.Delivery[]>(`/operator/webhooks/${id}/deliveries`),
  resetDemo: () => post<void>('/operator/demo/reset'),
};
