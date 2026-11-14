import { Stages } from './Common';
import { api, url } from '../api';
import { useAction } from '../hooks/employer';
import { num } from '@sera-payroll/core';
import { copyText, fiat, money } from '../lib/format';
import { useToast } from '../lib/toast';
import type { RunItem, RunRecord } from '../types';

export function slipTextOf(r: RunRecord, i: RunItem): string {
  const t = [`${r.label} payslip`, `Paid ${r.payday}`, `${i.name} (${i.type})`, i.kind, `Gross: ${fiat(i.gross, i.currency)}`];
  if (Number(i.deduction) > 0) t.push(`Statutory deductions: ${fiat(i.deduction, i.currency)}`);
  t.push(`Net: ${fiat(i.net, i.currency)}`);
  for (const g of i.payouts) t.push(`Received: ${g.amountText} (${g.sub}), value US$ ${num(g.usdValue, 'USD')}, ${g.lockedRate}${g.txHash ? `, tx ${g.txHash}` : ''}`);
  if (i.payslip?.anchorTx) t.push(`Payslip anchored on chain: ${i.payslip.anchorTx}`);
  return t.join('\n');
}

export function RecordView({ r, clientId }: { r: RunRecord; clientId: string }) {
  const toast = useToast();
  const retry = useAction((c, payoutId: string) => api.retry(c, payoutId), ['runRecord', 'runs', 'run']);
  return (
    <div className="card">
      {r.items.map((i) => (
        <div className="row" key={i.personId + i.kind}>
          <div className="rowtop">
            <span className="name">{i.name} <span className="chip plain">{i.kind}</span>{i.payslip?.anchorTx && <> <span className="chip">{i.payslip.explorerUrl ? <a href={i.payslip.explorerUrl} target="_blank" rel="noreferrer">Payslip on chain</a> : 'Payslip on chain'}</span></>}</span>
            <span className="mono" style={{ fontWeight: 700 }}>{fiat(i.net, i.currency)}</span>
          </div>
          {i.payouts.map((g) => (
            <div key={g.id} className="stack">
              <div className="rowtop"><span className="mono" style={{ fontWeight: 700 }}>{money(g.amount, g.option)}</span><span className="fine mono">{g.lockedRate}</span></div>
              <Stages p={g} />
              {g.state === 'failed' && <div><button type="button" className="ghostbtn" disabled={retry.isPending} onClick={() => retry.mutate(g.id)}>Retry this payout</button></div>}
            </div>
          ))}
          <div className="btns">
            <button type="button" className="ghostbtn" onClick={() => copyText(slipTextOf(r, i), 'Payslip', toast)}>Copy payslip</button>
            <a className="ghostbtn" href={url(`/clients/${clientId}/runs/${r.id}/payslips/${i.personId}.pdf`)} target="_blank" rel="noreferrer">Payslip PDF</a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function recordStatus(r: RunRecord): string {
  let run = 0, fail = 0, held = 0;
  for (const i of r.items) for (const g of i.payouts) { if (g.state === 'running' || g.state === 'queued') run++; if (g.state === 'failed') fail++; if (g.state === 'held') held++; }
  return run ? 'In progress' : fail ? `${fail} failed` : held ? `Complete, ${held} held` : 'Complete';
}
