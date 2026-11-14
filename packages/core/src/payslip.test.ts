import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { disclose, leafHash, merkleProof, merkleRoot, sealPayslip, verifyProof, type PayslipDocument } from './payslip.js';

const doc: PayslipDocument = {
  version: 1, runId: 'run-1', runLabel: 'November 2026', payday: '2026-11-28', employer: '0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f01', employerName: 'Sample Studio Sdn Bhd',
  personId: 'p1', personName: 'Aisyah Rahman', personType: 'Employee', kind: 'Salary', currency: 'MYR', gross: '8500.00', deduction: '0.00', net: '8500.00',
  payouts: [{ option: 'MYRT', amount: '8500.00', lockedRate: '1 USDT = 4.2000 MYRT', usdValue: '2023.81', txHash: null, address: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', network: 'ethereum' }],
};

describe('on-chain payslip commitments', () => {
  it('seals deterministically with given salts and verifies single-field disclosure', () => {
    let n = 0;
    const salt = () => keccak256(toHex(`salt-${n++}`));
    const sealed = sealPayslip(doc, salt);
    const again = sealPayslip(doc, sealed.leaves.map((l) => l.salt));
    expect(again.root).toBe(sealed.root);
    expect(again.docHash).toBe(sealed.docHash);
    const d = disclose(sealed, ['net', 'payday']);
    for (const f of d.fields) expect(verifyProof(d.root, f.leaf, f.proof)).toBe(true);
    // Tampered value fails
    const bad = { ...d.fields[0]!.leaf, value: '99999.00' };
    expect(verifyProof(d.root, bad, d.fields[0]!.proof)).toBe(false);
  });
  it('merkle proofs for every leaf of odd and even trees', () => {
    for (const size of [1, 2, 3, 7, 8]) {
      const leaves = Array.from({ length: size }, (_, i) => ({ name: `f${i}`, value: `${i}`, salt: keccak256(toHex(i)) }));
      const hashes = leaves.map(leafHash);
      const root = merkleRoot(hashes);
      leaves.forEach((l, i) => expect(verifyProof(root, l, merkleProof(hashes, i))).toBe(true));
    }
  });
});
