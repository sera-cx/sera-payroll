import { useState } from 'react';
import { verifyProof, type PayslipLeaf } from '@sera-payroll/core';
import { createPublicClient, http, isAddress, isHex, type Hex } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { VerifyIntro } from './VerifyIntro';
import sampleProof from '../data/sepolia-sample-proof.json';

/** A real proof: Aisyah Rahman's October 2026 payslip, anchored in the PayslipRegistry on Sepolia. */
export const SAMPLE_PROOF_TEXT = JSON.stringify(sampleProof, null, 2);

interface Bundle {
  root: Hex;
  fields: { leaf: PayslipLeaf; proof: Hex[] }[];
  anchorTx?: string | null;
  explorerUrl?: string | null;
  chainId?: number | null;
  registry?: string | null;
  anchorId?: string | null;
}
interface ChainCheck { found: boolean; matches: boolean; employer: string; payday: string; version: number; anchoredAt: string }
interface Result { root: Hex; fields: { name: string; value: string; ok: boolean }[]; allOk: boolean; chain: ChainCheck | { error: string } | null; explorerUrl: string | null }

const REGISTRY_ABI = [{
  type: 'function', name: 'getAnchor', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }],
  outputs: [{ type: 'tuple', components: [{ name: 'employer', type: 'address' }, { name: 'payday', type: 'uint64' }, { name: 'root', type: 'bytes32' }, { name: 'docHash', type: 'bytes32' }, { name: 'anchoredAt', type: 'uint64' }, { name: 'version', type: 'uint32' }] }],
}] as const;

const ZERO = '0x0000000000000000000000000000000000000000';
const day = (unix: number) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : '');

export async function checkBundle(text: string): Promise<Result> {
  let b: Bundle;
  try { b = JSON.parse(text) as Bundle; } catch { throw new Error('That is not valid JSON. Paste the whole proof bundle.'); }
  if (!b || !isHex(b.root) || !Array.isArray(b.fields) || b.fields.length === 0) throw new Error('The bundle needs a root and at least one field.');
  const fields = b.fields.map((f) => {
    const leaf = f.leaf ?? ({} as PayslipLeaf);
    const ok = !!leaf.name && typeof leaf.value === 'string' && isHex(leaf.salt) && Array.isArray(f.proof) && f.proof.every((h) => isHex(h)) && verifyProof(b.root, leaf, f.proof);
    return { name: String(leaf.name ?? ''), value: String(leaf.value ?? ''), ok };
  });
  let chain: Result['chain'] = null;
  if (b.registry && b.anchorId && b.chainId && isAddress(b.registry) && isHex(b.anchorId)) {
    try {
      const client = createPublicClient({ chain: b.chainId === 1 ? mainnet : sepolia, transport: http(b.chainId === 1 ? undefined : 'https://sepolia.gateway.tenderly.co') });
      const a = await client.readContract({ address: b.registry, abi: REGISTRY_ABI, functionName: 'getAnchor', args: [b.anchorId] });
      chain = { found: a.employer !== ZERO, matches: a.root.toLowerCase() === b.root.toLowerCase(), employer: a.employer, payday: day(Number(a.payday)), version: a.version, anchoredAt: day(Number(a.anchoredAt)) };
    } catch (e) { chain = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return { root: b.root, fields, allOk: fields.every((f) => f.ok), chain, explorerUrl: b.explorerUrl ?? null };
}

export function Verify() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const run = async (t: string) => {
    setBusy(true); setError(null); setResult(null);
    try { setResult(await checkBundle(t)); }
    catch (x) { setError(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); void run(text); };
  const trySample = () => { setText(SAMPLE_PROOF_TEXT); void run(SAMPLE_PROOF_TEXT); };
  return (
    <div className="notes">
      <VerifyIntro />
      <form className="card pad mt" onSubmit={submit}>
        <label>Proof bundle<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{"root":"0x…","fields":[{"leaf":{"name":"net","value":"8500.00","salt":"0x…"},"proof":["0x…"]}]}' spellCheck={false} aria-describedby="vhelp" /></label>
        <p id="vhelp" className="fine">To get one in the demo: open the employee view, press Share a proof on a payslip, and copy it. Or try the sample below, which was anchored on Sepolia for real.</p>
        <div className="btns">
          <button type="submit" className="cta" disabled={busy || !text.trim()}>{busy ? 'Checking…' : 'Verify'}</button>
          <button type="button" className="ghostbtn" disabled={busy} onClick={trySample}>Try a proof anchored on Sepolia</button>
          {text && <button type="button" className="ghostbtn" onClick={() => { setText(''); setResult(null); setError(null); }}>Clear</button>}
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </form>
      {result && <ResultView r={result} />}
    </div>
  );
}

function ResultView({ r }: { r: Result }) {
  const chainOk = r.chain && !('error' in r.chain) && r.chain.found && r.chain.matches;
  return (
    <section className="card pad mt" aria-live="polite">
      <h2 style={{ margin: 0 }}>{r.allOk ? (chainOk ? 'Verified against the payslip root and the on-chain anchor' : 'Fields match the payslip root') : 'Verification failed'}</h2>
      <table className="vt">
        <thead><tr><th>Field</th><th>Value</th><th>Proof</th></tr></thead>
        <tbody>{r.fields.map((f, i) => <tr key={i}><td>{f.name}</td><td className="mono">{f.value}</td><td>{f.ok ? <span className="chip paid">Matches root</span> : <span className="chip warn">Does not match</span>}</td></tr>)}</tbody>
      </table>
      <p className="fine mono addr">Root {r.root}</p>
      {r.chain === null && <p className="fine">This bundle carries no registry address, so the root was not compared with a chain. Demo proofs verify locally only.</p>}
      {r.chain && 'error' in r.chain && <p className="err">Could not read the registry: {r.chain.error}</p>}
      {r.chain && !('error' in r.chain) && (r.chain.found ? (
        <ul className="intro-list">
          <li>On-chain root {r.chain.matches ? 'matches' : 'does not match'} this bundle.</li>
          <li>Anchored by employer <span className="mono addr">{r.chain.employer}</span> on {r.chain.anchoredAt}, pay date {r.chain.payday}, version {r.chain.version}.</li>
          {r.explorerUrl && <li><a href={r.explorerUrl} target="_blank" rel="noreferrer">Open the anchoring transaction</a></li>}
        </ul>
      ) : <p className="err">No anchor found in the registry for this payslip.</p>)}
    </section>
  );
}
