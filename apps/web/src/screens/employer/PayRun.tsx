import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FIAT, ccyOf, isBank, num } from '@sera-payroll/core';
import { api } from '../../api';
import { KV, Loading, Path, ErrorNote } from '../../components/Common';
import { RecordView, recordStatus } from '../../components/RecordView';
import { useClient, useRun, useRunAction, useRunRecord, useRuns } from '../../hooks/employer';
import { fiat, fundLabel, money, when } from '../../lib/format';
import { useClientId, useSession } from '../../lib/session';
import type { RunView } from '../../types';
import { FundingBox } from './FundingBox';
import { SignDialog } from './SignDialog';

export function PayRun() {
  const run = useRun();
  if (run.error) return <ErrorNote error={run.error} />;
  if (!run.data) return <Loading what="Loading the pay run" />;
  if (run.data.status === 'sent' || run.data.status === 'complete') return <SentRun run={run.data} />;
  return <DraftRun run={run.data} />;
}

function SentRun({ run }: { run: RunView }) {
  const clientId = useClientId();
  const rec = useRunRecord(run.id, true);
  const client = useClient();
  const runs = useRuns();
  const nav = useNavigate();
  const next = useRunAction((c) => api.nextRun(c));
  if (!rec.data) return <Loading />;
  const r = rec.data;
  const st = recordStatus(r);
  return (
    <>
      <div className="flex"><h1>{r.label} pay run</h1><span className="chip paid">Signed and sent</span><span className={`chip${/failed/.test(st) ? ' warn' : ''}`}>{st}</span></div>
      <p className="sub">Sent {when(r.sentAt)}. Each payout moves through its stages below.</p>
      <div className="cols">
        <div className="main"><section><h2>Payout tracking</h2><RecordView r={r} clientId={clientId} /></section></div>
        <aside className="side">
          <div className="ghost" aria-hidden="true">S</div>
          <div className="fine strong">You sent</div>
          <div><div className="big mono">{num(r.need, ccyOf(r.fundingSource))}</div><div className="mono" style={{ fontWeight: 700 }}>{fundLabel(r.fundingSource)}</div></div>
          <KV k="Payouts" v={r.count} />
          <KV k="Swaps on Sera.cx" v={r.swaps} />
          <KV k="Schedule" v={client.data?.settings.schedule ?? ''} />
          <button type="button" className="cta" disabled={next.isPending} onClick={() => next.mutate(undefined, { onSuccess: (d) => { if (d.status !== 'draft') nav(`/employer/history/${r.id}`); } })}>Draft the next run</button>
          <p className="fine">The next run copies this roster. Payslips are in the Employee view and the export is under History{runs.data?.length ? ` (${runs.data.length})` : ''}.</p>
        </aside>
      </div>
    </>
  );
}

function DraftRun({ run }: { run: RunView }) {
  const { me } = useSession();
  const client = useClient();
  const [signing, setSigning] = useState(false);
  const nav = useNavigate();
  const setFund = useRunAction((c, fundingSource: string) => api.patchRun(c, { fundingSource }));
  const skip = useRunAction((c, v: { personId: string; skipped: boolean }) => api.skip(c, v.personId, v.skipped));
  const addX = useRunAction((c, v: { personId: string; amount: string; currency: string; kind: string }) => api.addOneOff(c, v));
  const delX = useRunAction((c, id: string) => api.removeOneOff(c, id));
  const submit = useRunAction((c) => api.submit(c, run.id));
  const unsubmit = useRunAction((c) => api.unsubmit(c, run.id));
  const t = run.totals;
  const sub = run.status === 'submitted';
  const two = client.data?.settings.twoPerson ?? true;
  const role = me.user?.role;
  const canPrepare = role === 'preparer' || role === 'operator_admin';
  const canApprove = role === 'approver' || role === 'operator_admin' || (!two && role === 'preparer');
  const self = two && !!run.preparedBy && run.preparedBy.id === me.user?.id;
  const people = Array.from(new Map(run.lines.map((l) => [l.personId, l.name])).entries());
  return (
    <>
      <div className="rowtop">
        <div>
          <div className="flex"><h1>{run.label} pay run</h1><span className={`chip${sub ? ' warn' : ''}`}>{sub ? 'Waiting for approver' : 'Draft'}</span></div>
          <p className="sub">{run.lines.length} payments. Pays on {run.payday}. {run.schedule}{run.per ? `, ${run.per}` : ''}. Rates {run.rateSource === 'sera.cx' ? 'from Sera.cx' : 'are samples'}.</p>
        </div>
      </div>
      <div className="cols">
        <div className="main">
          <section>
            <h2>1. Fund this pay run in</h2>
            <div className="opts">
              {run.fundingOptions.map((o) => (
                <button key={o.option} type="button" className="opt" aria-pressed={run.fundingSource === o.option} disabled={sub || !o.enabled || setFund.isPending} onClick={() => setFund.mutate(o.option)}>
                  {isBank(o.option) ? `Bank ${ccyOf(o.option)}` : o.option}
                  {isBank(o.option) && <small>{o.enabled ? 'via on-ramp partner' : o.reason ?? 'no on-ramp connected'}</small>}
                </button>
              ))}
            </div>
          </section>
          <FundingBox run={run} />
          <section>
            <h2>3. Who gets what</h2>
            <div className="card">
              {run.lines.length === 0 && <div className="row"><span className="sub">No employees yet. Add or import them under Employees.</span></div>}
              {run.lines.map((l) => (
                <div className="row" key={l.oneOffId ?? `${l.personId}-salary`}>
                  <div className="rowtop">
                    <span className="name">{l.name} <span className="chip plain">{l.kind}</span> <span className="chip plain">{l.type}</span></span>
                    <span className="mono" style={{ fontWeight: 700 }}>{fiat(l.net, l.currency)}</span>
                  </div>
                  {Number(l.deduction) > 0 && <div className="fine">Gross {fiat(l.gross, l.currency)}, statutory plug-in deducts {fiat(l.deduction, l.currency)}</div>}
                  {l.skipped && <div className="fine strong">Skipped for this run. Nothing will be sent.</div>}
                  {l.legs.map((g, gi) => (
                    <div key={gi} className="stack">
                      <div className="rowtop"><span><span className="chip">{g.sharePercent}%</span> <span className="mono" style={{ fontWeight: 700 }}>{money(g.amount, g.option)}</span></span><span className="fine mono">{g.rateLine}</span></div>
                      <Path steps={g.path} />
                      {g.issue && <div className="err">{g.issue}</div>}
                      {!g.issue && g.flagged && <div className="err">Screening flagged this address. This payout will be held and the rest of the run goes ahead.</div>}
                    </div>
                  ))}
                  {!sub && canPrepare && l.oneOffId && <div><button type="button" className="ghostbtn" onClick={() => delX.mutate(l.oneOffId!)}>Remove one-off</button></div>}
                  {!sub && canPrepare && !l.oneOffId && <div><button type="button" className="ghostbtn" onClick={() => skip.mutate({ personId: l.personId, skipped: !l.skipped })}>{l.skipped ? 'Include in this run' : 'Skip this run'}</button></div>}
                </div>
              ))}
            </div>
            {!sub && canPrepare && people.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary>Add a one-off payment (bonus, invoice, reimbursement)</summary>
                <form className="grid" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); addX.mutate({ personId: String(fd.get('p')), amount: String(fd.get('a')), currency: String(fd.get('c')), kind: String(fd.get('n')) }, { onSuccess: () => f.reset() }); }}>
                  <label>Person<select name="p">{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                  <label>Amount<input type="number" name="a" min="1" step="any" required /></label>
                  <label>Currency<select name="c">{FIAT.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label>Type<select name="n"><option>Bonus</option><option>Contractor invoice</option><option>Reimbursement</option></select></label>
                  <button type="submit" className="ghostbtn" disabled={addX.isPending}>Add to this run</button>
                </form>
              </details>
            )}
          </section>
        </div>
        <aside className="side">
          <div className="ghost" aria-hidden="true">S</div>
          <div className="fine strong">You send</div>
          <div><div className="big mono">{num(t.need, t.fundingCurrency)}</div><div className="mono" style={{ fontWeight: 700 }}>{fundLabel(run.fundingSource)}</div></div>
          <KV k="Payouts" v={money(t.payouts, run.fundingSource)} mono />
          <KV k={`Operator fee, ${t.feePercent}%`} v={money(t.fee, run.fundingSource)} mono />
          <KV k="Network fees" v={client.data?.settings.gasPayer === 'employee' ? 'paid by employees' : money(t.gas, run.fundingSource)} mono />
          <KV k="Swaps on Sera.cx" v={t.swaps} />
          <KV k="To wallet / to bank" v={`${t.toWallet} / ${t.toBank}`} />
          {t.held > 0 && <KV k="Held by screening" v={t.held} />}
          {two && !sub ? (
            <>
              <button type="button" className="cta" disabled={!(t.ready && canPrepare) || submit.isPending} onClick={() => submit.mutate(undefined)}>Submit for approval</button>
              {!canPrepare && <p className="fine">A preparer submits this draft. You are signed in as {role?.replace('_', ' ')}.</p>}
            </>
          ) : (
            <>
              <button type="button" className="cta" disabled={!(t.canSend && canApprove && !self)} onClick={() => setSigning(true)}>Review, sign and send</button>
              {two && !canApprove && <p className="fine">An approver signs this run. You are signed in as {role?.replace('_', ' ')}.</p>}
              {self && <p className="fine">You prepared this run, so another approver must sign it.</p>}
              {two && canPrepare && <button type="button" className="ghostbtn" disabled={unsubmit.isPending} onClick={() => unsubmit.mutate(undefined)}>Send back to draft</button>}
            </>
          )}
          {t.issues > 0 ? <div className="err">Fix {t.issues} issue{t.issues > 1 ? 's' : ''} in the list before this run can go.</div>
            : !t.funding.ok && <div className="err">Funding check has not passed yet.</div>}
          <p className="fine">Every payout is screened before it leaves. Swaps settle on Sera.cx and funds never sit with the operator.</p>
        </aside>
      </div>
      {signing && <SignDialog run={run} onClose={() => setSigning(false)} onSent={() => { setSigning(false); nav('/employer/run'); }} />}
    </>
  );
}

