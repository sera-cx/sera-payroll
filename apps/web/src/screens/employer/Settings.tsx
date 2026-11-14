import { SCHEDULES } from '@sera-payroll/core';
import { api } from '../../api';
import { Loading } from '../../components/Common';
import { useAction, useClient, useRun } from '../../hooks/employer';
import type { Settings as S } from '../../types';

export function Settings() {
  const client = useClient();
  const run = useRun();
  const save = useAction((c, s: Partial<S>) => api.settings(c, s), ['client', 'run']);
  if (!client.data) return <Loading />;
  const s = client.data.settings;
  const draft = run.data?.status === 'draft';
  const Tog = ({ k, label }: { k: keyof S; label: string }) => (
    <label className="tog"><input type="checkbox" checked={!!s[k]} onChange={(e) => save.mutate({ [k]: e.target.checked })} />{label}</label>
  );
  return (
    <>
      <h1>Settings</h1>
      <div className="card pad mt" style={{ gap: 6 }}>
        <Tog k="twoPerson" label="Two-person approval: one prepares, another signs" />
        <Tog k="multisig" label="Treasury is a multisig wallet, 2 of 3 signatures" />
        <Tog k="requireTestPayment" label="Require a test payment before the first payout to a new address" />
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <label>Pay schedule
          <select disabled={!draft} value={s.schedule} onChange={(e) => save.mutate({ schedule: e.target.value })}>
            {SCHEDULES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label>Network fees paid by
          <select value={s.gasPayer} onChange={(e) => save.mutate({ gasPayer: e.target.value as S['gasPayer'] })}>
            <option value="employer">Employer</option>
            <option value="employee">Employee, deducted from payout</option>
          </select>
        </label>
        <label>Treasury wallet<input type="text" className="mono" readOnly value={s.treasuryWallet ?? 'Not set'} /></label>
      </div>
      <p className="fine" style={{ marginTop: 12 }}>The schedule sets the pay dates and how much of monthly pay each run carries. It can be changed while the current run is a draft. The operator fee ({s.feePercent}%), the {s.addressHoldHours} hour address hold, the treasury wallet and ramp partners are set by your payroll operator.</p>
    </>
  );
}
