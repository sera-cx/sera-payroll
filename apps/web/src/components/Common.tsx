import type { ReactNode } from 'react';
import type { PathStep, PayoutView, Wallet } from '../types';

export function Path({ steps }: { steps: PathStep[] }) {
  return (
    <div className="path">
      {steps.map((s, i) => (
        <span key={i} className="inline" style={{ gap: 6 }}>
          {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
          <span className={`step${s.sera ? ' sera' : ''}`}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

export function Stages({ p }: { p: PayoutView }) {
  if (p.state === 'held') return <div className="err">Held. {p.failureReason}</div>;
  return (
    <>
      <div className="path">
        {p.stages.map((s, i) => {
          const c = p.state === 'done' || i < p.stageIndex ? 'done' : i === p.stageIndex && (p.state === 'running' || p.state === 'queued') ? 'now' : 'todo';
          return (
            <span key={i} className="inline" style={{ gap: 6 }}>
              {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
              <span className={`step ${c}`}>{s}</span>
            </span>
          );
        })}
      </div>
      {p.state === 'failed' && <div className="err">Failed. {p.failureReason}</div>}
      {p.txHash && (
        <div className="fine mono addr">
          tx {p.explorerUrl ? <a href={p.explorerUrl} target="_blank" rel="noreferrer">{p.txHash.slice(0, 10)}…{p.txHash.slice(-6)}</a> : <>{p.txHash.slice(0, 10)}…{p.txHash.slice(-6)}</>}
        </div>
      )}
    </>
  );
}

export function SourceChips({ w }: { w: Wallet }) {
  if (!w.address) return <span className="chip warn">No wallet address</span>;
  return (
    <span className="flex" style={{ gap: 6 }}>
      <span className="chip">{w.source === 'employer' ? 'Entered by employer' : w.source === 'employee_signed' ? 'Signed by employee' : 'Pasted by employee'}</span>
      {w.locked && <span className="chip paid">Locked</span>}
      {w.tested && <span className="chip plain">Tested</span>}
      {w.screening === 'flagged' && <span className="chip warn">Flagged by screening</span>}
      {w.screening === 'clear' && <span className="chip plain">Screened</span>}
    </span>
  );
}

export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return <div className="kv"><span>{k}</span><span className={mono ? 'mono' : undefined}>{v}</span></div>;
}

export function Tabs({ items, current, onPick }: { items: [string, string][]; current: string; onPick: (k: string) => void }) {
  return (
    <div className="tabs" role="group" aria-label="Sections">
      {items.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={current === k} onClick={() => onPick(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="sub" role="status">{what}…</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  const m = error instanceof Error ? error.message : String(error);
  return <div className="err" role="alert">{m}</div>;
}
