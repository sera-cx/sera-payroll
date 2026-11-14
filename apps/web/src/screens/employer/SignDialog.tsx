import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useSendTransaction, useSignTypedData } from 'wagmi';
import type { Hex } from 'viem';
import { api } from '../../api';
import { KV } from '../../components/Common';
import { useClientId } from '../../lib/session';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import type { ChainPlan, RunRecord, RunView, TypedData } from '../../types';

type Step = { label: string; state: 'todo' | 'busy' | 'ok' | 'bad'; detail?: string };

export function SignDialog({ run, onClose, onSent }: { run: RunView; onClose: () => void; onSent: (r: RunRecord) => void }) {
  const { me } = useSession();
  const clientId = useClientId();
  const qc = useQueryClient();
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const primary = useRef<HTMLButtonElement>(null);
  const t = run.totals;
  const ms = run.multisig;
  const collected = ms?.collected.length ?? 0;
  const needMore = !!ms && collected < ms.threshold;
  const alreadySigned = !!ms && !!address && ms.collected.some((a) => a.toLowerCase() === address.toLowerCase());

  useEffect(() => { primary.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const sign = async (td: TypedData) => signTypedDataAsync({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message } as unknown as Parameters<typeof signTypedDataAsync>[0]);

  async function multisigSign() {
    if (!run.approval || !address) return;
    setBusy(true);
    try {
      const signature = await sign(run.approval);
      const next = await api.multisigSign(clientId, run.id, { signature, signerAddress: address });
      qc.setQueryData(['run', clientId], next);
      toast(`Signature ${(next.multisig?.collected.length ?? 0)} of ${next.multisig?.threshold ?? 0} collected`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function approve(demo: boolean) {
    setBusy(true);
    const s: Step[] = [{ label: demo ? 'Approve the run (demo signature)' : 'Sign the pay run approval with your wallet', state: 'busy' }];
    setSteps(s);
    try {
      let signature = 'demo', signer: string | null = null;
      if (!demo) {
        if (!run.approval || !address) throw new Error('Connect the treasury wallet first.');
        signature = await sign(run.approval);
        signer = address;
      }
      const rec = await api.approve(clientId, run.id, { signature, signerAddress: signer, simulateFailure: me.demoMode ? simulateFailure : undefined });
      s[0] = { ...s[0]!, state: 'ok' };
      setSteps([...s]);
      if (rec.chainPlan) await runChainPlan(rec, rec.chainPlan, s);
      await qc.invalidateQueries({ queryKey: ['run', clientId] });
      await qc.invalidateQueries({ queryKey: ['runs', clientId] });
      await qc.invalidateQueries({ queryKey: ['client', clientId] });
      await qc.invalidateQueries({ queryKey: ['outbox', clientId] });
      onSent(rec);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setSteps((prev) => prev.map((x) => (x.state === 'busy' ? { ...x, state: 'bad', detail: m } : x)));
      toast(m);
    } finally { setBusy(false); }
  }

  async function runChainPlan(rec: RunRecord, plan: ChainPlan, s: Step[]) {
    for (const sw of plan.swaps) {
      const step: Step = { label: `Sign the Sera.cx swap for payout ${sw.payoutId.slice(0, 8)}`, state: 'busy' };
      s.push(step); setSteps([...s]);
      if (!sw.quote) throw new Error(sw.error ?? 'Sera.cx could not prepare this swap.');
      const q = sw.quote;
      // Sign route_params exactly as Sera.cx returned them.
      const signature = await sign({ domain: q.domain, types: q.types, primaryType: 'Intent', message: q.routeParams });
      let permitSignature: string | null = null, permitDeadline: number | null = null;
      if (q.permit) {
        permitSignature = await sign(q.permit.eip712);
        const d = (q.permit.eip712.message as { deadline?: unknown }).deadline ?? q.permit.suggested_deadline;
        permitDeadline = d == null ? null : Number(d);
      }
      await api.submitSwap(clientId, rec.id, sw.payoutId, { signature, permitSignature, permitDeadline });
      step.state = 'ok'; setSteps([...s]);
    }
    if (plan.disburse) {
      const step: Step = { label: 'Send the batched payouts from the treasury wallet', state: 'busy' };
      s.push(step); setSteps([...s]);
      const hash = await sendTransactionAsync({ to: plan.disburse.to as Hex, data: plan.disburse.data as Hex, value: plan.disburse.value ? BigInt(plan.disburse.value) : undefined });
      await api.submitDisburse(clientId, rec.id, hash);
      step.state = 'ok'; step.detail = hash; setSteps([...s]);
    }
  }

  const canWallet = isConnected && !!run.approval;
  return (
    <div className="ov">
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlh">
        <h2 id="dlh" style={{ margin: 0, fontSize: 22 }}>Sign and send</h2>
        <p className="sub" style={{ margin: 0 }}>Your wallet signs the pay run, then the funds leave the treasury. Rates lock when you sign.</p>
        <KV k="You send" v={money(t.need, run.fundingSource)} mono />
        <KV k="Payouts" v={t.count} />
        <KV k="Swaps on Sera.cx" v={t.swaps} />
        {t.held > 0 && <KV k="Held by screening" v={t.held} />}
        {ms && (
          <>
            <KV k="Multisig signatures" v={`${Math.min(collected, ms.threshold)} of ${ms.threshold}`} />
            {needMore && <button type="button" className="ghostbtn" disabled={busy || !canWallet || alreadySigned} onClick={multisigSign}>{alreadySigned ? 'You have signed' : `Sign as signer ${collected + 1}`}</button>}
            {needMore && !canWallet && me.demoMode && <button type="button" className="ghostbtn" disabled={busy} onClick={async () => { setBusy(true); try { const next = await api.multisigSign(clientId, run.id, { signature: 'demo', signerAddress: `demo-signer-${collected + 1}` }); qc.setQueryData(['run', clientId], next); } finally { setBusy(false); } }}>Sign as signer {collected + 1} (demo)</button>}
          </>
        )}
        {me.demoMode && <label className="tog"><input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />Simulate one failed payout</label>}
        {steps.length > 0 && (
          <div className="progress" aria-live="polite">
            {steps.map((x, i) => <div key={i} className={x.state}>{x.state === 'ok' ? '✓ ' : x.state === 'busy' ? '… ' : x.state === 'bad' ? '✕ ' : '· '}{x.label}{x.detail && <div className="fine mono addr">{x.detail}</div>}</div>)}
          </div>
        )}
        {canWallet ? (
          <button ref={primary} type="button" className="cta" disabled={busy || needMore} onClick={() => approve(false)}>Sign and send</button>
        ) : me.demoMode ? (
          <>
            <p className="fine">No wallet connected. In the demo you can approve without one; nothing is paid for real.</p>
            <button ref={primary} type="button" className="cta" disabled={busy || needMore} onClick={() => approve(true)}>Sign and send (demo)</button>
          </>
        ) : (
          <p className="err">Connect the treasury wallet to sign.</p>
        )}
        <button type="button" className="ghostbtn" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
