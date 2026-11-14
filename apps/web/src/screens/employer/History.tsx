import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Loading } from '../../components/Common';
import { RecordView, recordStatus } from '../../components/RecordView';
import { useRunRecord, useRuns } from '../../hooks/employer';
import { copyText, download, money } from '../../lib/format';
import { useClientId } from '../../lib/session';
import { useToast } from '../../lib/toast';

export function History() {
  const { runId } = useParams();
  if (runId) return <RunDetail runId={runId} />;
  return <RunList />;
}

function RunList() {
  const runs = useRuns();
  const nav = useNavigate();
  return (
    <>
      <h1>History</h1>
      <p className="sub">Every run with its totals, rates and status.</p>
      <div className="card mt">
        {!runs.data && <div className="row"><Loading /></div>}
        {runs.data?.length === 0 && <div className="row"><span className="sub">No runs sent yet.</span></div>}
        {runs.data?.map((r) => {
          const st = recordStatus(r);
          return (
            <div className="row" key={r.id}>
              <div className="rowtop"><span className="name">{r.label} <span className={`chip${/failed/.test(st) ? ' warn' : ''}`}>{st}</span></span><span className="mono" style={{ fontWeight: 700 }}>{money(r.need, r.fundingSource)}</span></div>
              <div className="rowtop"><span className="fine">Paid {r.payday}, {r.count} payouts, {r.swaps} swaps on Sera.cx</span><button type="button" className="ghostbtn" onClick={() => nav(`/employer/history/${r.id}`)}>Open</button></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const clientId = useClientId();
  const rec = useRunRecord(runId, true);
  const csv = useQuery({ queryKey: ['export', clientId, runId], queryFn: () => api.exportCsv(clientId, runId), enabled: !!rec.data });
  const toast = useToast();
  if (!rec.data) return <Loading />;
  const r = rec.data;
  return (
    <>
      <Link className="ghostbtn" to="/employer/history">Back to all runs</Link>
      <h1 style={{ marginTop: 16 }}>{r.label}</h1>
      <p className="sub">Paid {r.payday}. {money(r.need, r.fundingSource)} sent, {r.count} payouts, {recordStatus(r)}.</p>
      <p className="fine">{r.by}. Signed with {r.signedWith}.</p>
      <div style={{ marginTop: 18 }}><RecordView r={r} clientId={clientId} /></div>
      <h2 style={{ marginTop: 22 }}>Accounting export</h2>
      <p className="fine">One line per payout with the fiat value at the time of payment.</p>
      <textarea readOnly aria-label="Accounting export" style={{ marginTop: 8, minHeight: 160 }} value={csv.data ?? ''} />
      <div className="btns" style={{ marginTop: 8 }}>
        <button type="button" className="ghostbtn" disabled={!csv.data} onClick={() => copyText(csv.data ?? '', 'Accounting export', toast)}>Copy export</button>
        <button type="button" className="ghostbtn" disabled={!csv.data} onClick={() => download(`${r.label.replace(/\s+/g, '-').toLowerCase()}-payouts.csv`, csv.data ?? '')}>Download CSV</button>
      </div>
    </>
  );
}
