import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { applyIfDue, approvePending, cancelPending, emptyWallet, employeeSetAddress, employerSetAddress, markTested, setLocked, AddressRuleError } from './address.js';

const A = getAddress('0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E');
const B = getAddress('0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f01');
const t0 = new Date('2026-11-15T00:00:00Z');

describe('wallet address rules (sections 4 and 7)', () => {
  it('employer entry is good for payout at once, no hold', () => {
    const { wallet, event } = employerSetAddress(emptyWallet(), A.toLowerCase(), 'admin@x', t0);
    expect(wallet.address).toBe(A); // checksummed
    expect(wallet.source).toBe('employer');
    expect(wallet.pending).toBeNull();
    expect(event.action).toMatch(/Employer entered/);
  });
  it('first-time employee address has no hold', () => {
    const { wallet } = employeeSetAddress(emptyWallet(), A, 'employee_signed', 48, 'p1', '0xsig', t0);
    expect(wallet.address).toBe(A);
    expect(wallet.pending).toBeNull();
    expect(wallet.signature).toBe('0xsig');
  });
  it('changing an existing address starts a configurable hold', () => {
    const w = employerSetAddress(emptyWallet(), A, 'admin', t0).wallet;
    const { wallet } = employeeSetAddress({ ...w, tested: true }, B, 'employee_pasted', 24, 'p1', null, t0);
    expect(wallet.address).toBe(A);
    expect(wallet.pending?.address).toBe(B);
    expect(wallet.pending?.liveAt.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(wallet.tested).toBe(true); // nothing applied yet
    expect(applyIfDue(wallet, new Date('2026-11-15T23:00:00Z'))).toBeNull();
    const due = applyIfDue(wallet, new Date('2026-11-16T00:00:01Z'))!;
    expect(due.wallet.address).toBe(B);
    expect(due.wallet.tested).toBe(false); // any change clears tested
    expect(due.wallet.pending).toBeNull();
  });
  it('employer can approve early or reject, employee can cancel', () => {
    const w = employeeSetAddress(employerSetAddress(emptyWallet(), A, 'admin', t0).wallet, B, 'employee_signed', 48, 'p1', '0x1', t0).wallet;
    expect(approvePending(w, 'admin', t0).wallet.address).toBe(B);
    expect(cancelPending(w, 'p1', t0).wallet.address).toBe(A);
    expect(cancelPending(w, 'p1', t0).wallet.pending).toBeNull();
    expect(() => approvePending(emptyWallet(), 'admin')).toThrow(AddressRuleError);
  });
  it('lock blocks every change and cancels a pending one', () => {
    const w = employeeSetAddress(employerSetAddress(emptyWallet(), A, 'admin', t0).wallet, B, 'employee_signed', 48, 'p1', '0x1', t0).wallet;
    const tr = setLocked(w, true, 'admin', t0);
    expect(tr).toHaveLength(2);
    const locked = tr[tr.length - 1]!.wallet;
    expect(locked.locked).toBe(true);
    expect(locked.pending).toBeNull();
    expect(() => employerSetAddress(locked, B, 'admin')).toThrow(/locked/i);
    expect(() => employeeSetAddress(locked, B, 'employee_signed', 48, 'p1')).toThrow(/locked/i);
    const unlocked = setLocked(locked, false, 'admin', t0)[0]!.wallet;
    expect(unlocked.locked).toBe(false);
  });
  it('rejects malformed addresses and re-setting the same address', () => {
    expect(() => employerSetAddress(emptyWallet(), '0x123', 'admin')).toThrow(/valid/);
    const w = employerSetAddress(emptyWallet(), A, 'admin', t0).wallet;
    expect(() => employeeSetAddress(w, A.toLowerCase(), 'employee_pasted', 48, 'p1')).toThrow(/already/);
  });
  it('test payment flag', () => {
    expect(() => markTested(emptyWallet(), 'admin')).toThrow();
    expect(markTested(employerSetAddress(emptyWallet(), A, 'admin', t0).wallet, 'admin').wallet.tested).toBe(true);
  });
});
