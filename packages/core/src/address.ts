/**
 * Wallet address state machine.
 *   none → active (employer entry or employee signature)
 *        → pending change (employee-requested, hold) → active
 * Flags: locked, tested. Any address change clears "tested". Locking cancels a
 * pending change. Every transition is returned as an AddressEvent for the audit log.
 */
import { isAddress, getAddress } from 'viem';
import type { AddressEvent, AddressSource, Network, WalletAddress } from './types.js';

export class AddressRuleError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'AddressRuleError'; }
}

export interface Transition { wallet: WalletAddress; event: AddressEvent }

export function emptyWallet(network: Network = 'ethereum'): WalletAddress {
  return { address: null, network, source: null, signature: null, locked: false, tested: false, screening: 'unscreened', screeningReason: null, pending: null };
}

export function normaliseAddress(a: string): string {
  const t = a.trim();
  if (!isAddress(t, { strict: false })) throw new AddressRuleError('Address is not a valid 0x address.', 'invalid_address');
  return getAddress(t);
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function ev(actor: string, action: string, oldAddress: string | null, newAddress: string | null, at: Date): AddressEvent {
  return { at, actor, action, oldAddress, newAddress };
}

/** Employer enters or replaces an address. Good for payout without employee confirmation. No hold. */
export function employerSetAddress(w: WalletAddress, address: string, actor: string, at = new Date()): Transition {
  if (w.locked) throw new AddressRuleError('Address is locked. Unlock it first.', 'locked');
  const a = normaliseAddress(address);
  return {
    wallet: { ...w, address: a, source: 'employer', signature: null, tested: false, screening: 'unscreened', screeningReason: null, pending: null },
    event: ev(actor, 'Employer entered address', w.address, a, at),
  };
}

/**
 * Employee adds or changes their own address. A first-time address goes live at
 * once. Changing an existing address starts a hold of `holdHours`.
 */
export function employeeSetAddress(w: WalletAddress, address: string, source: Exclude<AddressSource, 'employer'>, holdHours: number, actor: string, signature: string | null = null, at = new Date()): Transition {
  if (w.locked) throw new AddressRuleError('Address is locked by your employer. Ask them to unlock it.', 'locked');
  const a = normaliseAddress(address);
  if (!w.address) {
    return {
      wallet: { ...w, address: a, source, signature, tested: false, screening: 'unscreened', screeningReason: null, pending: null },
      event: ev(actor, source === 'employee_signed' ? 'Employee signed address' : 'Employee pasted address', null, a, at),
    };
  }
  if (a === w.address) throw new AddressRuleError('That is already the address on file.', 'same_address');
  const liveAt = new Date(at.getTime() + holdHours * 3600_000);
  return {
    wallet: { ...w, pending: { address: a, source, requestedAt: at, liveAt } },
    event: ev(actor, `Employee requested change, ${holdHours} hour hold started`, w.address, a, at),
  };
}

/** Employer approves a pending change before the hold lapses. */
export function approvePending(w: WalletAddress, actor: string, at = new Date()): Transition {
  if (!w.pending) throw new AddressRuleError('No pending change.', 'no_pending');
  return applyPending(w, actor, 'Employer approved change early', at);
}

/** Called by a scheduler once liveAt has passed. No-op when nothing is due. */
export function applyIfDue(w: WalletAddress, at = new Date()): Transition | null {
  if (!w.pending || w.pending.liveAt > at) return null;
  return applyPending(w, 'system', 'Hold lapsed, change went live', at);
}

function applyPending(w: WalletAddress, actor: string, action: string, at: Date): Transition {
  const p = w.pending!;
  return {
    wallet: { ...w, address: p.address, source: p.source, tested: false, screening: 'unscreened', screeningReason: null, pending: null },
    event: ev(actor, action, w.address, p.address, at),
  };
}

/** Employee cancels, or employer rejects, a pending change. */
export function cancelPending(w: WalletAddress, actor: string, at = new Date()): Transition {
  if (!w.pending) throw new AddressRuleError('No pending change.', 'no_pending');
  return { wallet: { ...w, pending: null }, event: ev(actor, 'Pending change cancelled', w.address, w.pending.address, at) };
}

/** Lock: nobody can change the address until an employer admin unlocks it. Locking cancels a pending change. */
export function setLocked(w: WalletAddress, locked: boolean, actor: string, at = new Date()): Transition[] {
  const out: Transition[] = [];
  let cur = w;
  if (locked && cur.pending) {
    out.push({ wallet: (cur = { ...cur, pending: null }), event: ev(actor, 'Pending change cancelled by lock', cur.address, null, at) });
  }
  out.push({ wallet: (cur = { ...cur, locked }), event: ev(actor, locked ? 'Locked by employer' : 'Unlocked by employer', cur.address, cur.address, at) });
  return out;
}

export function markTested(w: WalletAddress, actor: string, at = new Date()): Transition {
  if (!w.address) throw new AddressRuleError('No address to test.', 'no_address');
  return { wallet: { ...w, tested: true }, event: ev(actor, 'Test payment confirmed', w.address, w.address, at) };
}

export function setScreening(w: WalletAddress, status: 'clear' | 'flagged', reason: string | null, at = new Date()): Transition {
  return { wallet: { ...w, screening: status, screeningReason: reason }, event: ev('screening', status === 'clear' ? 'Screening clear' : `Screening flagged: ${reason ?? 'no reason given'}`, w.address, w.address, at) };
}

/** The message an employee signs to prove an address. Bound to person, client, network and a server nonce. */
export function addressProofMessage(p: { brand: string; personId: string; clientId: string; address: string; network: Network; nonce: string; issuedAt: string }): string {
  return [
    `${p.brand} wants you to prove you control this wallet address for salary payouts.`,
    '',
    `Address: ${p.address}`,
    `Network: ${p.network}`,
    `Person: ${p.personId}`,
    `Client: ${p.clientId}`,
    `Nonce: ${p.nonce}`,
    `Issued at: ${p.issuedAt}`,
    '',
    'Signing costs nothing and moves no funds.',
  ].join('\n');
}
