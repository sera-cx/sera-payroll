/**
 * On-chain payslips.
 *
 * Salary data never goes on chain in the clear. A payslip is:
 *   1. A canonical JSON document (fields below) held off chain by the operator
 *      and given to the employee.
 *   2. A Merkle tree over its fields, each leaf salted, so the employee can prove
 *      one field (for example net pay) to a lender or landlord without revealing
 *      the rest.
 *   3. The Merkle root, signed by the employer with EIP-712, and anchored on chain
 *      in PayslipRegistry together with the payout transaction hash.
 * Anyone with the document and salts can recompute the root and check the anchor.
 * The chain holds only hashes, the payday and the employer's address.
 */
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from 'viem';
import type { Fiat, PayoutOption } from './currencies.js';

export interface PayslipDocument {
  version: 1;
  runId: string;
  runLabel: string;
  payday: string; // ISO date
  employer: Address;
  employerName: string;
  personId: string;
  personName: string;
  personType: 'Employee' | 'Contractor';
  kind: string;
  currency: Fiat;
  gross: string;
  deduction: string;
  net: string;
  payouts: { option: PayoutOption; amount: string; lockedRate: string; usdValue: string; txHash: Hex | null; address: Address | null; network: string | null }[];
}

export type PayslipFieldName = keyof Omit<PayslipDocument, 'version' | 'payouts'> | `payout.${number}.${'option' | 'amount' | 'lockedRate' | 'usdValue' | 'txHash' | 'address' | 'network'}`;

export interface PayslipLeaf { name: string; value: string; salt: Hex }

/** Flatten a payslip into name/value pairs in a fixed order. */
export function payslipFields(doc: PayslipDocument): { name: string; value: string }[] {
  const base = ['runId', 'runLabel', 'payday', 'employer', 'employerName', 'personId', 'personName', 'personType', 'kind', 'currency', 'gross', 'deduction', 'net'] as const satisfies readonly (keyof PayslipDocument)[];
  const out: { name: string; value: string }[] = base.map((k) => ({ name: k, value: String(doc[k]) }));
  doc.payouts.forEach((p, i) => {
    for (const k of ['option', 'amount', 'lockedRate', 'usdValue', 'txHash', 'address', 'network'] as const) out.push({ name: `payout.${i}.${k}`, value: p[k] == null ? '' : String(p[k]) });
  });
  return out;
}

export function leafHash(leaf: PayslipLeaf): Hex {
  return keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'string' }, { type: 'bytes32' }], [leaf.name, leaf.value, leaf.salt]));
}

function pairHash(a: Hex, b: Hex): Hex {
  const [x, y] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [x, y]));
}

/** Sorted-pair Merkle root over the leaf hashes. Odd leaves are carried up unchanged. */
export function merkleRoot(hashes: Hex[]): Hex {
  if (hashes.length === 0) return keccak256('0x');
  let level = hashes.slice();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pairHash(level[i]!, level[i + 1]!) : level[i]!);
    level = next;
  }
  return level[0]!;
}

export function merkleProof(hashes: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let level = hashes.slice();
  let i = index;
  while (level.length > 1) {
    const sib = i % 2 === 0 ? i + 1 : i - 1;
    if (sib < level.length) proof.push(level[sib]!);
    const next: Hex[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(j + 1 < level.length ? pairHash(level[j]!, level[j + 1]!) : level[j]!);
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(root: Hex, leaf: PayslipLeaf, proof: Hex[]): boolean {
  let h = leafHash(leaf);
  for (const p of proof) h = pairHash(h, p);
  return h.toLowerCase() === root.toLowerCase();
}

export interface SealedPayslip {
  doc: PayslipDocument;
  leaves: PayslipLeaf[];
  root: Hex;
  /** keccak256 of the canonical JSON, for a whole-document check. */
  docHash: Hex;
}

/** Salt every field and compute the root. `salts` lets a stored payslip be re-sealed deterministically. */
export function sealPayslip(doc: PayslipDocument, salts: Hex[] | (() => Hex)): SealedPayslip {
  const fields = payslipFields(doc);
  const leaves = fields.map((f, i) => ({ ...f, salt: Array.isArray(salts) ? salts[i]! : salts() }));
  const root = merkleRoot(leaves.map(leafHash));
  const docHash = keccak256(toHex(canonicalJson(doc)));
  return { doc, leaves, root, docHash };
}

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}

/** A disclosure the employee hands to a third party: one or more fields with proofs. */
export function disclose(sealed: SealedPayslip, names: string[]): { root: Hex; fields: { leaf: PayslipLeaf; proof: Hex[] }[] } {
  const hashes = sealed.leaves.map(leafHash);
  return { root: sealed.root, fields: names.map((n) => { const i = sealed.leaves.findIndex((l) => l.name === n); if (i < 0) throw new Error(`No field ${n}`); return { leaf: sealed.leaves[i]!, proof: merkleProof(hashes, i) }; }) };
}

/** EIP-712 types. The employer signs the root; the signature is stored with the anchor. */
export const PAYSLIP_TYPES = {
  Payslip: [
    { name: 'runId', type: 'bytes32' },
    { name: 'personId', type: 'bytes32' },
    { name: 'payday', type: 'uint64' },
    { name: 'root', type: 'bytes32' },
    { name: 'docHash', type: 'bytes32' },
  ],
} as const;

export const PAYRUN_APPROVAL_TYPES = {
  PayRunApproval: [
    { name: 'runId', type: 'bytes32' },
    { name: 'clientId', type: 'bytes32' },
    { name: 'fundingAsset', type: 'string' },
    { name: 'totalMinor', type: 'uint256' },
    { name: 'payoutCount', type: 'uint32' },
    { name: 'payoutsRoot', type: 'bytes32' },
    { name: 'ratesLockedAt', type: 'uint64' },
  ],
} as const;

/**
 * The EIP-712 domain PayslipRegistry.sol verifies payslip signatures against.
 * Must match the contract's constructor exactly: name "Sera.cx Payroll Payslips", version "1".
 */
export function payslipRegistryDomain(chainId: number, registry: Address) {
  return { name: 'Sera.cx Payroll Payslips', version: '1', chainId, verifyingContract: registry } as const;
}

export function payrollDomain(chainId: number, verifyingContract: Address, brand: string) {
  return { name: `${brand} Payroll`, version: '1', chainId, verifyingContract } as const;
}

export function idToBytes32(id: string): Hex {
  return keccak256(toHex(id));
}
