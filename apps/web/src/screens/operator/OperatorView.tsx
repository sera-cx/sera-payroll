import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FIAT, LOCAL, RAIL, WEBHOOK_EVENTS } from '@sera-payroll/core';
import { api } from '../../api';
import { KV, Loading, Tabs } from '../../components/Common';
import { copyText, when } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';

export function OperatorView() {
  const nav = useNavigate();
  const loc = useLocation();
  const current = loc.pathname.split('/')[2] ?? 'clients';
  return (
    <>
      <Tabs items={[['clients', 'Clients'], ['ramps', 'Ramp partners'], ['plugins', 'Statutory plug-ins'], ['api', 'API and webhooks']]} current={current} onPick={(k) => nav(`/operator/${k}`)} />
      <Routes>
        <Route index element={<Navigate to="clients" replace />} />
        <Route path="clients" element={<Clients />} />
        <Route path="ramps" element={<Ramps />} />
        <Route path="plugins" element={<Plugins />} />
        <Route path="api" element={<ApiTab />} />
      </Routes>
    </>
  );
}

function useOp<V, R>(fn: (v: V) => Promise<R>, keys: string[]) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({ mutationFn: fn, onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), onError: (e: Error) => toast(e.message) });
}

function Clients() {
  const { clientId, setClientId } = useSession();
  const nav = useNavigate();
  const op = useQuery({ queryKey: ['operator'], queryFn: api.operator });
  const edit = useOp((v: { id: string; b: { feePercent?: string; treasuryWallet?: string; name?: string } }) => api.editClient(v.id, v.b), ['operator', 'client']);
  const add = useOp((b: { name: string; feePercent: string }) => api.addClient(b), ['operator']);
  if (!op.data) return <Loading />;
  return (
    <>
      <h1>Clients</h1>
      <p className="sub">One operator, many employers. Each has its own fee, roster, runs and treasury wallet. Pick one to work as that client.</p>
      <div className="card mt">
        {op.data.clients.map((c) => (
          <div className="row" key={c.id}>
            <div className="rowtop">
              <span className="name">{c.name}{c.id === clientId && <> <span className="chip paid">Active</span></>} <span className="fine">{c.peopleCount} people</span></span>
              <span className="btns">
                <label className="inline">Fee %<input type="number" min="0" step="0.05" defaultValue={c.feePercent} onBlur={(e) => { if (e.target.value !== c.feePercent) edit.mutate({ id: c.id, b: { feePercent: e.target.value } }); }} style={{ width: 90 }} /></label>
                <button type="button" className="ghostbtn" disabled={c.id === clientId} onClick={() => { setClientId(c.id); nav('/employer/run'); }}>Work as this client</button>
              </span>
            </div>
            <label>Treasury wallet<input type="text" className="mono" placeholder="0x address of the wallet or multisig that signs and funds runs" defaultValue={c.treasuryWallet ?? ''} onBlur={(e) => { if ((e.target.value || null) !== c.treasuryWallet) edit.mutate({ id: c.id, b: { treasuryWallet: e.target.value } }); }} /></label>
          </div>
        ))}
      </div>
      <form className="mt" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); add.mutate({ name: String(fd.get('n')), feePercent: String(fd.get('f')) }, { onSuccess: () => f.reset() }); }}>
        <h2>Add a client</h2>
        <div className="grid"><label>Name<input type="text" name="n" required /></label><label>Fee %<input type="number" name="f" min="0" step="0.05" defaultValue="0.5" required /></label><button type="submit" className="cta" disabled={add.isPending}>Add</button></div>
      </form>
    </>
  );
}

function Ramps() {
  const q = useQuery({ queryKey: ['ramps'], queryFn: api.ramps });
  const set = useOp((v: { c: string; b: { onRamp?: boolean; offRamp?: boolean } }) => api.setRamp(v.c, v.b), ['ramps', 'run', 'client', 'me-person']);
  if (!q.data) return <Loading />;
  return (
    <>
      <h1>Ramp partners</h1>
      <p className="sub">Your licensed partners per currency. Turn one off to see what breaks in the pay run.</p>
      <div className="card mt">
        {FIAT.map((c) => { const r = q.data![c]; return (
          <div className="row" key={c}>
            <div className="rowtop"><span className="name">{c} <span className="fine">{RAIL[c]}, settles as {LOCAL[c]}</span></span><span className="fine">{r?.partner ?? 'No adapter'}</span></div>
            <div className="flex" style={{ gap: '6px 24px' }}>
              <label className="tog"><input type="checkbox" checked={!!r?.onRamp} onChange={(e) => set.mutate({ c, b: { onRamp: e.target.checked } })} />On-ramp, bank to stablecoin</label>
              <label className="tog"><input type="checkbox" checked={!!r?.offRamp} onChange={(e) => set.mutate({ c, b: { offRamp: e.target.checked } })} />Off-ramp, stablecoin to bank</label>
            </div>
          </div>
        ); })}
      </div>
      <p className="fine" style={{ marginTop: 10 }}>With no ramp connected, a currency still works wallet to wallet through its stablecoin.</p>
    </>
  );
}

function Plugins() {
  const q = useQuery({ queryKey: ['plugins'], queryFn: api.plugins });
  const set = useOp((v: { c: string; on: boolean }) => api.setPlugin(v.c, v.on), ['plugins', 'run', 'client']);
  if (!q.data) return <Loading />;
  return (
    <>
      <h1>Statutory plug-ins</h1>
      <p className="sub">Country modules that turn gross into net for employees. Contractors are paid gross. The sample plug-in deducts a flat 10%, which is not a real statutory rate.</p>
      <div className="card pad mt" style={{ gap: 6 }}>
        {q.data.map((p) => <label key={p.currency} className="tog"><input type="checkbox" checked={p.enabled} onChange={(e) => set.mutate({ c: p.currency, on: e.target.checked })} />{p.country} plug-in for {p.currency} salaries <span className="fine">({p.plugin})</span></label>)}
      </div>
      <p className="fine" style={{ marginTop: 10 }}>Turn one on, then check the pay run and the payslip.</p>
    </>
  );
}

const SKETCH = `POST /v1/clients/{clientId}/people/import   upload a pay file
GET  /v1/clients/{clientId}/runs/current     the draft run
POST /v1/clients/{clientId}/runs/{id}/submit  preparer submits
POST /v1/clients/{clientId}/runs/{id}/approve approver signs and sends
GET  /v1/clients/{clientId}/runs/{id}/payouts stage of every payout
POST /v1/clients/{clientId}/payouts/{id}/retry retry one failed payout
GET  /v1/clients/{clientId}/runs/{id}/export  accounting export

Authorization: Bearer <api key>

Webhooks
run.submitted   run.sent   run.complete
payout.screened payout.swapped payout.sent
payout.arrived  payout.failed  payout.held
address.change_requested   address.locked   payslip.anchored`;

function ApiTab() {
  const toast = useToast();
  const keys = useQuery({ queryKey: ['apiKeys'], queryFn: api.apiKeys });
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: api.webhooks });
  const [shown, setShown] = useState<{ kind: string; value: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const deliveries = useQuery({ queryKey: ['deliveries', open], queryFn: () => api.deliveries(open!), enabled: !!open });
  const addKey = useOp((label: string) => api.addApiKey(label), ['apiKeys']);
  const delKey = useOp((id: string) => api.delApiKey(id), ['apiKeys']);
  const addHook = useOp((b: { url: string; events: string[] }) => api.addWebhook(b), ['webhooks']);
  const delHook = useOp((id: string) => api.delWebhook(id), ['webhooks']);
  return (
    <>
      <h1>API and webhooks</h1>
      <p className="sub">Plug this into an existing payroll system. Keys and secrets are shown once.</p>
      {shown && <div className="card pad mt"><div className="rowtop"><span className="name">New {shown.kind}. Copy it now.</span><button type="button" className="ghostbtn small" onClick={() => setShown(null)}>Dismiss</button></div><pre className="code mono">{shown.value}</pre><button type="button" className="ghostbtn" onClick={() => copyText(shown.value, shown.kind, toast)}>Copy</button></div>}
      <h2 className="mt">API keys</h2>
      <div className="card">
        {keys.data?.length === 0 && <div className="row"><span className="sub">No keys yet.</span></div>}
        {keys.data?.map((k) => <div className="row" key={k.id}><div className="rowtop"><span className="name">{k.label} <span className="fine">created {when(k.createdAt)}</span></span><button type="button" className="ghostbtn" onClick={() => delKey.mutate(k.id)}>Revoke</button></div></div>)}
      </div>
      <form className="grid mt-s" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; addKey.mutate(String(new FormData(f).get('l')), { onSuccess: (k) => { if (k.key) setShown({ kind: 'API key', value: k.key }); f.reset(); } }); }}>
        <label>Label<input type="text" name="l" required placeholder="e.g. HR system" /></label><button type="submit" className="ghostbtn">Create key</button>
      </form>
      <h2 className="mt">Webhooks</h2>
      <div className="card">
        {hooks.data?.length === 0 && <div className="row"><span className="sub">No webhooks yet.</span></div>}
        {hooks.data?.map((h) => (
          <div className="row" key={h.id}>
            <div className="rowtop"><span className="name mono addr">{h.url}</span><span className="btns"><button type="button" className="ghostbtn" onClick={() => setOpen(open === h.id ? null : h.id)}>Deliveries</button><button type="button" className="ghostbtn" onClick={() => delHook.mutate(h.id)}>Delete</button></span></div>
            <div className="fine">{h.events.join(', ')}</div>
            {open === h.id && <div className="stack">{deliveries.data?.length === 0 && <span className="fine">Nothing delivered yet.</span>}{deliveries.data?.map((d, i) => <KV key={i} k={`${when(d.at)} ${d.event}`} v={`${d.status}${d.responseCode ? ` (${d.responseCode})` : ''}`} />)}</div>}
          </div>
        ))}
      </div>
      <form className="stack mt-s" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); addHook.mutate({ url: String(fd.get('u')), events: fd.getAll('ev').map(String) }, { onSuccess: (h) => { if (h.secret) setShown({ kind: 'webhook secret', value: h.secret }); f.reset(); } }); }}>
        <label>URL<input type="url" name="u" required placeholder="https://" /></label>
        <div className="flex" style={{ gap: '0 16px' }}>{WEBHOOK_EVENTS.map((ev) => <label key={ev} className="tog" style={{ minHeight: 36 }}><input type="checkbox" name="ev" value={ev} defaultChecked />{ev}</label>)}</div>
        <div><button type="submit" className="ghostbtn">Add webhook</button></div>
      </form>
      <h2 className="mt">Endpoints</h2>
      <pre className="code mono">{SKETCH}</pre>
    </>
  );
}
