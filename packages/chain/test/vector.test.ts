import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { keccak256, toHex, type Hex } from 'viem';
import { disclose, leafHash, sealPayslip, verifyProof, type PayslipDocument } from '@sera-payroll/core';

const vector = JSON.parse(readFileSync(new URL('../../../contracts/test/vectors/payslip.json', import.meta.url), 'utf8')) as {
  root: Hex; docHash: Hex; leafCount: number; field: { name: string; value: string; salt: Hex }; leafHash: Hex; proof: Hex[];
};

const doc: PayslipDocument = {
  version: 1, runId: 'run-2026-11', runLabel: 'November 2026', payday: '2026-11-28', employer: '0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f01', employerName: 'Sample Studio Sdn Bhd',
  personId: 'p1', personName: 'Aisyah Rahman', personType: 'Employee', kind: 'Salary', currency: 'MYR', gross: '8500.00', deduction: '0.00', net: '8500.00',
  payouts: [{ option: 'MYRT', amount: '8500.00', lockedRate: '1 USDT = 4.2000 MYRT', usdValue: '2023.81', txHash: null, address: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', network: 'sepolia' }],
};

describe('payslip vector shared with contracts/test/PayslipRegistry.t.sol', () => {
  it('core reproduces the vector', () => {
    let n = 0;
    const sealed = sealPayslip(doc, () => keccak256(toHex(`vector-salt-${n++}`)));
    expect(sealed.root).toBe(vector.root);
    expect(sealed.docHash).toBe(vector.docHash);
    expect(sealed.leaves).toHaveLength(vector.leafCount);
    const d = disclose(sealed, ['net']);
    expect(d.fields[0]!.leaf).toEqual(vector.field);
    expect(leafHash(d.fields[0]!.leaf)).toBe(vector.leafHash);
    expect(d.fields[0]!.proof).toEqual(vector.proof);
    expect(verifyProof(vector.root, vector.field, vector.proof)).toBe(true);
  });
});
