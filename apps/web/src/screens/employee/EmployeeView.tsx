import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useConnect, useSignMessage } from 'wagmi';
import { isBank, optLabel, optSub, ccyOf, num } from '@sera-payroll/core';
import { api, url } from '../../api';
import { KV, Loading, SourceChips, ErrorNote } from '../../components/Common';
import { copyText, fiat, money, short, when } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import type { MeView, MyPayslip, Person } from '../../types';

export function EmployeeView() {
  const { me } = useSession();
  const q = useQuery({ queryKey: ['me-person'], queryFn: api.myself, retry: false });
  const slips = useQuery({ queryKey: ['me-payslips'], queryFn: api.myPayslips, refetchInterval: (x) => (x.state.data?.some((s) => s.payouts.some((p) => p.state === 'queued' || p.state === 'running')) ? 1500 : false) });
  if (q.error) return me.user?.role === 'operator_admin' ? <p className="sub">Sign in as a sample employee to see this view.</p> : <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const e = q.data;
  return (
    <div className="phone">
      {slips.data && slips.data.length > 0 && <PayslipCard slips={slips.data} />}
      <div><h1 style={{ fontSize: 26 }}>How do you want to be paid?</h1><p className="sub">Your {e.type === 'Contractor' ? 'fee' : 'salary'} is {fiat(e.monthlyPay, e.currency)} a month. Changes apply to the next run that has not been signed.</p></div>
      <PayoutPicker e={e} />
      {(isBank(e.payoutPrimary) || (e.payoutSecondary && isBank(e.payoutSecondary))) && !e.kycVerified && <VerifyCard e={e} />}
      <SplitCard e={e} />
      <AddressCard e={e} />
      <p className="fine center">Amounts are estimates until your employer signs the run. Settlement by Sera.cx.</p>
    </div>
  );
}

function usePersonMutation<V>(fn: (v: V) => Promise<Person | void>) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ['me-person'] }); }, onError: (e: Error) => toast(e.message) });
}

function PayslipCard({ slips }: { slips: MyPayslip[] }) {
  const toast = useToast();
  const [proof, setProof] = useState<string | null>(null);
  const s = slips[0]!;
  const text = () => {
    const t = [`${s.label} payslip`, `Paid ${s.payday}`, s.kind, `Gross: ${fiat(s.gross, s.currency)}`];
    if (Number(s.deduction) > 0) t.push(`Statutory deductions: ${fiat(s.deduction, s.currency)}`);
    t.push(`Net: ${fiat(s.net, s.currency)}`);
    for (const g of s.payouts) t.push(`Received: ${g.amountText} (${g.sub}), value US$ ${num(g.usdValue, 'USD')}, ${g.lockedRate}${g.txHash ? `, tx ${g.txHash}` : ''}`);
    if (s.payslip?.anchorTx) t.push(`Payslip anchored on chain: ${s.payslip.anchorTx}`);
    return t.join('\n');
  };
  const share = async () => {
    try { const d = await api.disclose(s.runId, ['net', 'payday']); setProof(JSON.stringify(d, null, 2)); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="side">
      <div className="ghost" aria-hidden="true">S</div>
      <div className="rowtop"><span className="fine strong">{s.label}, {s.kind.toLowerCase()}</span><span className="flex" style={{ gap: 6 }}><span className="chip paid">Payslip</span>{s.payslip?.anchorTx && <span className="chip">{s.payslip.explorerUrl ? <a href={s.payslip.explorerUrl} target="_blank" rel="noreferrer">Verified on chain</a> : 'Verified on chain'}</span>}</span></div>
      {s.payouts.map((g) => (
        <div key={g.id}>
          <div className="big mono" style={{ fontSize: 26 }}>{money(g.amount, g.option)}</div>
          <div className="fine">{g.sub}</div>
          <div className="fine strong">{g.state === 'done' ? 'Arrived' : g.state === 'running' || g.state === 'queued' ? `On its way: ${g.stages[g.stageIndex]}` : g.state === 'failed' ? 'Delayed. Your employer is retrying.' : 'On hold. Contact your employer.'}</div>
        </div>
      ))}
      <KV k="Gross" v={fiat(s.gross, s.currency)} mono />
      {Number(s.deduction) > 0 && <KV k="Statutory deductions" v={fiat(s.deduction, s.currency)} mono />}
      <KV k="Net" v={fiat(s.net, s.currency)} mono />
      {s.payouts.map((g) => <div key={g.id} className="stack"><KV k="Locked rate" v={g.lockedRate} mono /><KV k="Value when paid" v={`US$ ${num(g.usdValue, 'USD')}`} mono /></div>)}
      <div className="btns">
        <button type="button" className="ghostbtn" onClick={() => copyText(text(), 'Payslip', toast)}>Copy payslip</button>
        <a className="ghostbtn" href={url(`/me/payslips/${s.runId}.pdf`)} target="_blank" rel="noreferrer">Download PDF</a>
        {s.payslip && <button type="button" className="ghostbtn" onClick={share}>Share a proof</button>}
      </div>
      {proof && (
        <div className="stack">
          <p className="fine">This proves your net pay and pay date against the on-chain record without revealing the rest of the payslip. Give it to whoever asked.</p>
          <pre className="code mono">{proof}</pre>
          <button type="button" className="ghostbtn" onClick={() => copyText(proof, 'Proof', toast)}>Copy proof</button>
        </div>
      )}
      {slips.length > 1 && (
        <details>
          <summary className="fine">Earlier payslips ({slips.length - 1})</summary>
          {slips.slice(1).map((x) => <div key={x.runId} className="rowtop" style={{ marginTop: 8, alignItems: 'center' }}><span className="fine">{x.label}, {x.kind.toLowerCase()}, {fiat(x.net, x.currency)}</span><a className="ghostbtn" href={url(`/me/payslips/${x.runId}.pdf`)} target="_blank" rel="noreferrer">PDF</a></div>)}
        </details>
      )}
    </div>
  );
}

function PayoutPicker({ e }: { e: MeView }) {
  const m = usePersonMutation((payoutPrimary: string) => api.setPayout({ payoutPrimary }));
  return (
    <div className="stack">
      {e.payoutOptions.map((o) => (
        <button key={o.option} type="button" className="opt wide" aria-pressed={e.payoutPrimary === o.option} disabled={!o.enabled || m.isPending} onClick={() => m.mutate(o.option)}>
          <span>{optLabel(o.option)}<small>{o.enabled ? optSub(o.option) : o.reason ?? 'No off-ramp partner connected'}</small></span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(o.estimate, o.option)}</span>
        </button>
      ))}
    </div>
  );
}

function VerifyCard({ e }: { e: MeView }) {
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const start = useMutation({
    mutationFn: api.startVerification,
    onSuccess: (r) => { if (r.url && !r.url.startsWith('demo:')) window.open(r.url, '_blank', 'noopener'); else toast('Verified with the off-ramp partner (simulated)'); qc.invalidateQueries({ queryKey: ['me-person'] }); },
    onError: (x: Error) => toast(x.message),
  });
  const partner = e.ramps[ccyOf(isBank(e.payoutPrimary) ? e.payoutPrimary : e.payoutSecondary!)]?.partner ?? 'the off-ramp partner';
  return (
    <div className="card pad">
      <h2 style={{ margin: 0 }}>Verify for bank payouts</h2>
      <p className="fine">Bank payouts go through the off-ramp partner, who checks your identity and holds your bank details. This app never sees them.</p>
      {e.kycStatus === 'pending' ? <span className="chip warn">Verification in progress</span> : <button type="button" className="cta" disabled={start.isPending} onClick={() => start.mutate()}>Verify with {partner}{me.demoMode ? ' (demo)' : ''}</button>}
    </div>
  );
}

function SplitCard({ e }: { e: MeView }) {
  const m = usePersonMutation((b: { payoutSecondary?: string | null; splitPercent?: number }) => api.setPayout(b));
  const [pct, setPct] = useState(e.splitPercent);
  useEffect(() => { setPct(e.splitPercent); }, [e.splitPercent]);
  const options = e.payoutOptions.filter((o) => o.option !== e.payoutPrimary && o.enabled);
  const estimate = (option: string, share: number) => { const o = e.payoutOptions.find((x) => x.option === option); return o ? money((Number(o.estimate) * share) / 100, o.option) : ''; };
  return (
    <div className="card pad">
      <label className="tog"><input type="checkbox" checked={!!e.payoutSecondary} onChange={(ev) => m.mutate(ev.target.checked ? { payoutSecondary: (e.payoutPrimary === 'USDT' ? 'MYRT' : 'USDT'), splitPercent: 70 } : { payoutSecondary: null, splitPercent: 100 })} />Split my pay two ways</label>
      {e.payoutSecondary && (
        <>
          <label>Second payout<select value={e.payoutSecondary} onChange={(ev) => m.mutate({ payoutSecondary: ev.target.value })}>{options.map((o) => <option key={o.option} value={o.option}>{optLabel(o.option)}</option>)}</select></label>
          <label>Share to {optLabel(e.payoutPrimary)}: {pct}%<input type="range" min="10" max="90" step="5" value={pct} onChange={(ev) => setPct(Number(ev.target.value))} onMouseUp={() => m.mutate({ splitPercent: pct })} onTouchEnd={() => m.mutate({ splitPercent: pct })} onKeyUp={() => m.mutate({ splitPercent: pct })} /></label>
          <KV k={`${pct}% ${optLabel(e.payoutPrimary)}`} v={estimate(e.payoutPrimary, pct)} mono />
          <KV k={`${100 - pct}% ${optLabel(e.payoutSecondary)}`} v={estimate(e.payoutSecondary, 100 - pct)} mono />
        </>
      )}
    </div>
  );
}

function AddressCard({ e }: { e: MeView }) {
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [addr, setAddr] = useState('');
  const paste = usePersonMutation((a: string) => api.pasteAddress(a));
  const cancel = usePersonMutation(() => api.cancelPending());
  const signed = usePersonMutation(async () => {
    let a = address;
    if (!isConnected || !a) {
      const c = connectors[0];
      if (!c) throw new Error('No wallet found in this browser. Paste your address instead.');
      const r = await connectAsync({ connector: c });
      a = r.accounts[0];
    }
    if (!a) throw new Error('No account from the wallet.');
    const ch = await api.challenge(a);
    const signature = await signMessageAsync({ message: ch.message });
    return api.signAddress({ address: a, signature, nonce: ch.nonce });
  });
  const w = e.wallet;
  return (
    <div className="card pad">
      <div className="rowtop"><h2 style={{ margin: 0 }}>Your wallet address</h2><SourceChips w={w} /></div>
      {w.address ? <><div className="mono addr">{w.address}</div><div className="fine">{w.network}. Stablecoin pay is sent here.</div></> : <div className="fine">Add one to receive stablecoins. Your employer can also enter it for you.</div>}
      {w.pending && <><div className="err">Change to {short(w.pending.address)} requested. It goes live after the hold, at {when(w.pending.liveAt)}, and your employer has been emailed.</div><button type="button" className="ghostbtn" onClick={() => cancel.mutate(undefined)}>Cancel change</button></>}
      {w.locked ? <div className="fine strong">Locked by your employer. Ask them to unlock it before you change it.</div> : !w.pending && (
        <>
          <button type="button" className="cta" disabled={signed.isPending} onClick={() => signed.mutate(undefined, { onSuccess: () => toast('Address signed and saved') })}>{w.address ? 'Sign with a different wallet' : 'Connect wallet and sign'}</button>
          <p className="fine">Your wallet signs a short message to prove the address is yours. It costs nothing and moves no funds.</p>
          <form className="btns" onSubmit={(ev) => { ev.preventDefault(); paste.mutate(addr.trim(), { onSuccess: () => setAddr('') }); }}>
            <input type="text" aria-label="Paste a wallet address" placeholder="Or paste a 0x address" required pattern="0x[0-9a-fA-F]{40}" title="0x followed by 40 hex characters" value={addr} onChange={(ev) => setAddr(ev.target.value)} style={{ flex: '1 1 200px' }} />
            <button type="submit" className="ghostbtn" disabled={paste.isPending}>Save</button>
          </form>
        </>
      )}
    </div>
  );
}
