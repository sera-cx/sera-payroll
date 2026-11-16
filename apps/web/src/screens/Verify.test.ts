import { describe, expect, it } from 'vitest';
import { checkBundle } from './Verify';
import sample from '../data/sepolia-sample-proof.json';

describe('the sample proof anchored on Sepolia', () => {
  it('verifies every disclosed field against the root, offline', async () => {
    // Drop the registry so the check stays local; the on-chain comparison is covered by the live page.
    const { registry: _r, ...local } = sample;
    const r = await checkBundle(JSON.stringify(local));
    expect(r.allOk).toBe(true);
    expect(r.fields.map((f) => f.name)).toEqual(['net', 'currency', 'payday', 'employerName', 'payout.0.txHash']);
    expect(r.chain).toBeNull();
  });

  it('rejects a tampered value', async () => {
    const { registry: _r, ...local } = sample;
    local.fields[0]!.leaf.value = '9500.00';
    const r = await checkBundle(JSON.stringify(local));
    expect(r.allOk).toBe(false);
    expect(r.fields[0]!.ok).toBe(false);
  });
});
