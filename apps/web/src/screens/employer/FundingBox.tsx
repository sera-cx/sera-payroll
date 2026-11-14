import { useState } from 'react';
import { LOCAL, ccyOf, isBank } from '@sera-payroll/core';
import { api } from '../../api';
import { KV } from '../../components/Common';
import { useRunAction, useAction } from '../../hooks/employer';
import { fiat, money } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { Deposit, RunView } from '../../types';

export function FundingBox({ run }: { run: RunView }) {
  const { me } = useSession();
  const t = run.totals;
  const f = t.funding;
  const [dep, setDep] = useState<Deposit | null>(f.kind === 'bank' ? f.deposit ?? null : null);
  const instructions = useAction((c) => api.fundingInstructions(c), [], { onSuccess: (d) => setDep(d) });
  const confirm = useRunAction((c, reference: string) => api.fundingConfirm(c, reference));
  const topup = useRunAction((c) => api.topup(c));
  const editable = run.status === 'draft';
  return (
    <section>
      <h2>2. Funding check</h2>
      <div className="card pad">
        {f.kind === 'bank' ? (
          !f.rampOk ? <div className="err">No on-ramp partner connected for {t.fundingCurrency}.</div>
          : f.funded ? <><div><span className="chip paid">Funds received</span></div><div className="fine">The on-ramp partner converted your transfer to {LOCAL[t.fundingCurrency]}.</div></>
          : (
            <>
              <KV k="Transfer" v={fiat(t.need, t.fundingCurrency)} mono />
              {dep ? (
                <>
                  <KV k="To" v={dep.beneficiary} />
                  {Object.entries(dep.accountDetails).map(([k, v]) => <KV key={k} k={k} v={v} mono />)}
                  <KV k="Reference" v={dep.reference} mono />
                </>
              ) : <div><button type="button" className="ghostbtn" disabled={!editable || instructions.isPending} onClick={() => instructions.mutate(undefined)}>Show deposit details</button></div>}
              <div><span className="chip warn">Waiting for funds</span></div>
              {dep && <div><button type="button" className="ghostbtn" disabled={!editable || confirm.isPending} onClick={() => confirm.mutate(dep.reference)}>{me.demoMode ? 'Mark funds received (demo)' : 'Check with the on-ramp partner'}</button></div>}
            </>
          )
        ) : (
          <>
            <KV k="Treasury wallet balance" v={money(f.balance, run.fundingSource)} mono />
            <KV k="This run needs" v={money(t.need, run.fundingSource)} mono />
            {Number(f.shortBy) > 0 ? (
              <>
                <div className="err">Short by {money(f.shortBy, run.fundingSource)}. Top up before signing.</div>
                {me.demoMode && <div><button type="button" className="ghostbtn" disabled={topup.isPending} onClick={() => topup.mutate(undefined)}>Top up demo wallet</button></div>}
              </>
            ) : <div><span className="chip paid">Enough to cover this run</span></div>}
            {!isBank(run.fundingSource) && <p className="fine">Balance read for {run.fundingSource} ({ccyOf(run.fundingSource)}) from the treasury wallet.</p>}
          </>
        )}
      </div>
    </section>
  );
}
