import { useState } from 'react';
import { SAMPLE_PAY_FILE, optLabel } from '@sera-payroll/core';
import { api } from '../../api';
import { KV, Loading, SourceChips } from '../../components/Common';
import { useAction, usePeople } from '../../hooks/employer';
import { copyText, fiat, short, when } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import type { Person } from '../../types';

const INV = ['people', 'run'];

export function Employees() {
  const [q, setQ] = useState('');
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const people = usePeople();
  const toast = useToast();
  const imp = useAction((c, text: string) => api.importPeople(c, text), INV, { onSuccess: (r) => { setMsg(r.message); setCsv(''); } });
  const add = useAction((c, b: { name: string; type: string; monthlyPay: string; currency: string; email?: string }) => api.addPerson(c, b), INV);
  if (!people.data) return <Loading />;
  const shown = people.data.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Employees</h1>
      <p className="sub">Everyone you pay, employees and contractors. Salary is set in their home currency.</p>
      <details className="card pad mt">
        <summary>Bulk import from a pay file</summary>
        <p className="fine">Columns: name, salary, currency, address (optional), type (optional). Every address is screened on import.</p>
        <textarea id="csv" aria-label="Pay file contents" placeholder="name,salary,currency,address,type" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="btns">
          <button type="button" className="ghostbtn" onClick={() => setCsv(SAMPLE_PAY_FILE)}>Load sample file</button>
          <label className="ghostbtn filebtn" style={{ color: 'var(--ink)', fontSize: 15 }}>Choose CSV file<input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then(setCsv); }} /></label>
          <button type="button" className="cta" disabled={!csv.trim() || imp.isPending} onClick={() => imp.mutate(csv)}>Import</button>
        </div>
      </details>
      {msg && <p className="sub" role="status">{msg}</p>}
      <label style={{ marginTop: 16 }}>Find a person ({shown.length} of {people.data.length} shown)<input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" /></label>
      <div className="card" style={{ marginTop: 12 }}>
        {shown.length === 0 && <div className="row"><span className="sub">Nobody matches.</span></div>}
        {shown.map((p) => <PersonRow key={p.id} p={p} />)}
      </div>
      <form style={{ marginTop: 22 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); add.mutate({ name: String(fd.get('n')).trim(), monthlyPay: String(fd.get('a')), currency: String(fd.get('c')), type: String(fd.get('t')), email: String(fd.get('e') || '') || undefined }, { onSuccess: () => { f.reset(); toast('Added'); } }); }}>
        <h2>Add one person</h2>
        <div className="grid">
          <label>Name<input type="text" name="n" required /></label>
          <label>Email (for invites)<input type="email" name="e" /></label>
          <label>Monthly pay<input type="number" name="a" min="1" step="any" required /></label>
          <label>Currency<select name="c">{(['MYR', 'SGD', 'USD', 'IDR', 'JPY'] as const).map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Type<select name="t"><option>Employee</option><option>Contractor</option></select></label>
          <button type="submit" className="cta" disabled={add.isPending}>Add</button>
        </div>
      </form>
    </>
  );
}

function PersonRow({ p }: { p: Person }) {
  const toast = useToast();
  const { me } = useSession();
  const [addr, setAddr] = useState('');
  const edit = useAction((c, b: Partial<Pick<Person, 'monthlyPay' | 'type'>>) => api.editPerson(c, p.id, b), INV);
  const remove = useAction((c) => api.removePerson(c, p.id), INV);
  const invite = useAction((c) => api.invite(c, p.id), ['outbox'], { onSuccess: (r) => copyText(r.url, 'Invite link', toast) });
  const setAddress = useAction((c, a: string) => api.setAddress(c, p.id, a), INV, { onSuccess: () => setAddr('') });
  const lock = useAction((c, locked: boolean) => api.lock(c, p.id, locked), INV);
  const approve = useAction((c) => api.approvePending(c, p.id), INV);
  const reject = useAction((c) => api.rejectPending(c, p.id), INV);
  const test = useAction((c) => api.testPayment(c, p.id), INV, { onSuccess: () => toast(me.demoMode ? 'Test payment confirmed (simulated)' : 'Test payment sent') });
  const w = p.wallet;
  return (
    <div className="row">
      <div className="rowtop">
        <span className="name">{p.name} <span className="chip plain">{p.type}</span> <span className={`chip${p.setupDone ? '' : ' warn'}`}>{p.setupDone ? 'Set up' : 'Not set up yet'}</span></span>
        <span className="mono" style={{ fontWeight: 700 }}>{fiat(p.monthlyPay, p.currency)}</span>
      </div>
      <div className="rowtop">
        <span className="fine">Receives {p.payoutSecondary ? `${p.splitPercent}% ${optLabel(p.payoutPrimary)} + ${100 - p.splitPercent}% ${optLabel(p.payoutSecondary)}` : `100% ${optLabel(p.payoutPrimary)}`}{p.kycVerified ? ', verified with the off-ramp partner' : ''}</span>
        <span className="btns">
          <button type="button" className="ghostbtn" disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>Copy invite link</button>
          <button type="button" className="ghostbtn" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${p.name} from the roster?`)) remove.mutate(undefined); }}>Remove</button>
        </span>
      </div>
      <div className="grid">
        <label>Monthly pay, {p.currency}<input type="number" min="1" step="any" defaultValue={p.monthlyPay} onBlur={(e) => { if (e.target.value && e.target.value !== p.monthlyPay) edit.mutate({ monthlyPay: e.target.value }); }} /></label>
        <label>Type<select value={p.type} onChange={(e) => edit.mutate({ type: e.target.value as Person['type'] })}><option>Employee</option><option>Contractor</option></select></label>
      </div>
      <div className="wal">
        <div className="rowtop"><span className="fine strong">Wallet address, {w.network}</span><SourceChips w={w} /></div>
        {w.address && <div className="mono addr">{w.address}</div>}
        {w.screening === 'flagged' && w.screeningReason && <div className="err">{w.screeningReason}</div>}
        {w.pending && (
          <>
            <div className="err">Employee asked to change to {short(w.pending.address)}. Live after the hold, at {when(w.pending.liveAt)}.</div>
            <div className="btns"><button type="button" className="ghostbtn" onClick={() => approve.mutate(undefined)}>Approve now</button><button type="button" className="ghostbtn" onClick={() => reject.mutate(undefined)}>Reject</button></div>
          </>
        )}
        {!w.locked && (
          <form className="btns" onSubmit={(e) => { e.preventDefault(); setAddress.mutate(addr.trim()); }}>
            <input type="text" aria-label={`Wallet address for ${p.name}`} placeholder="0x address" required pattern="0x[0-9a-fA-F]{40}" title="0x followed by 40 hex characters" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ flex: '1 1 220px' }} />
            <button type="submit" className="ghostbtn" disabled={setAddress.isPending}>{w.address ? 'Replace address' : 'Save address'}</button>
          </form>
        )}
        {w.address && (
          <div className="btns">
            <button type="button" className="ghostbtn" disabled={lock.isPending} onClick={() => lock.mutate(!w.locked)}>{w.locked ? 'Unlock address' : 'Lock address'}</button>
            {!w.tested && w.screening !== 'flagged' && <button type="button" className="ghostbtn" disabled={test.isPending} onClick={() => test.mutate(undefined)}>Send test payment</button>}
          </div>
        )}
        {p.history.length > 0 && (
          <details>
            <summary className="fine">History ({p.history.length})</summary>
            {p.history.map((h, i) => <KV key={i} k={when(h.at)} v={`${h.action}${h.newAddress && h.newAddress !== h.oldAddress ? `, ${short(h.newAddress)}` : ''} (${h.actor})`} />)}
          </details>
        )}
      </div>
    </div>
  );
}
