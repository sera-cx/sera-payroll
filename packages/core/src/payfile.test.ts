import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { parsePayFile, SAMPLE_PAY_FILE, importMessage } from './payfile.js';

describe('pay file import (section 10)', () => {
  it('imports the sample file', () => {
    const r = parsePayFile(SAMPLE_PAY_FILE);
    expect(r.rows).toHaveLength(4);
    expect(r.rejected).toHaveLength(0);
    expect(r.rows[1]!.type).toBe('Contractor');
    expect(r.rows[3]!.address).toBeNull();
    expect(r.rows[0]!.address).toBe(getAddress('0x4b1D9e7A2c5F8036d1E4a7B0c3F6d9E2a5B8c1D4'));
  });
  it('rejects bad rows and reports the line', () => {
    const r = parsePayFile('name,salary,currency,address,type\n,100,MYR,,\nBob,0,MYR,,\nAnn,100,XXX,,\nCid,100,SGD,0xnope,\nDee,100,sgd,,');
    expect(r.rows).toHaveLength(1);
    expect(r.rejected.map((x) => x.line)).toEqual([2, 3, 4, 5]);
    expect(r.rejected[3]!.reason).toMatch(/address/);
    expect(importMessage(r)).toMatch(/Imported 1\. Skipped 4/);
  });
  it('catches duplicate people and addresses, including against the existing roster', () => {
    const r = parsePayFile('A,1,MYR,0x4b1D9e7A2c5F8036d1E4a7B0c3F6d9E2a5B8c1D4,\nA,1,MYR,,\nB,1,MYR,0x4b1d9e7a2c5f8036d1e4a7b0c3f6d9e2a5b8c1d4,\nAisyah Rahman,1,MYR,,', { names: ['Aisyah Rahman'], addresses: [] });
    expect(r.rows.map((x) => x.name)).toEqual(['A']);
    expect(r.rejected).toHaveLength(3);
  });
});
