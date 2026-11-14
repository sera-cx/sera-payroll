/**
 * Pay file import (section 10) and accounting export / payslip text (csvFor, slipText).
 *   name,salary,currency,address,type
 * Address and type are optional. Type defaults to Employee. Reject rows with a
 * missing name, a salary not above zero, an unsupported currency or a malformed
 * address, and report each rejected line. Also catch duplicate people and addresses.
 */
import { isAddress, getAddress } from 'viem';
import { ccyOf, isFiat, optLabel, type Fiat } from './currencies.js';
import { D } from './money.js';
import type { PersonType } from './types.js';
import type { RunRecord, RunItem } from './run.js';

export interface ImportRow { name: string; monthlyPay: string; currency: Fiat; address: string | null; type: PersonType }
export interface ImportResult { rows: ImportRow[]; rejected: { line: number; reason: string }[] }

export const SAMPLE_PAY_FILE = [
  'name,salary,currency,address,type',
  'Siti Aminah,5200,MYR,0x4b1D9e7A2c5F8036d1E4a7B0c3F6d9E2a5B8c1D4,Employee',
  'Kenji Sato,420000,JPY,0x7c2E0f8B3d6A9147e2F5b8C1d4A7e0F3b6C9d2E5,Contractor',
  'Budi Santoso,15000000,IDR,0xdead00000000000000000000000000000000beef,Contractor',
  'Maria Lim,3800,SGD,,Employee',
].join('\n');

export function parsePayFile(text: string, existing: { names: string[]; addresses: string[] } = { names: [], addresses: [] }): ImportResult {
  const rows: ImportRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seenNames = new Set(existing.names.map((n) => n.trim().toLowerCase()));
  const seenAddr = new Set(existing.addresses.map((a) => a.toLowerCase()));
  String(text).split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const c = raw.split(',').map((x) => x.trim());
    if (i === 0 && (c[0] ?? '').toLowerCase() === 'name') return;
    const line = i + 1;
    const name = c[0] ?? '';
    const salary = c[1] ?? '';
    const ccy = (c[2] ?? '').toUpperCase();
    const addr = c[3] ?? '';
    const type: PersonType = /contractor/i.test(c[4] ?? '') ? 'Contractor' : 'Employee';
    let pay: ReturnType<typeof D> | null = null;
    try { pay = D(salary); } catch { pay = null; }
    if (!name || !pay || !pay.isFinite() || pay.lte(0) || !isFiat(ccy)) { rejected.push({ line, reason: 'needs name, salary and a supported currency' }); return; }
    if (addr && !isAddress(addr, { strict: false })) { rejected.push({ line, reason: 'address is not valid' }); return; }
    if (seenNames.has(name.toLowerCase())) { rejected.push({ line, reason: `duplicate person "${name}"` }); return; }
    const norm = addr ? getAddress(addr) : null;
    if (norm && seenAddr.has(norm.toLowerCase())) { rejected.push({ line, reason: `duplicate address ${norm}` }); return; }
    seenNames.add(name.toLowerCase());
    if (norm) seenAddr.add(norm.toLowerCase());
    rows.push({ name, monthlyPay: pay.toString(), currency: ccy, address: norm, type });
  });
  return { rows, rejected };
}

export function importMessage(r: ImportResult): string {
  return `Imported ${r.rows.length}.` + (r.rejected.length ? ` Skipped ${r.rejected.length} (${r.rejected.map((x) => `line ${x.line}: ${x.reason}`).join('; ')}).` : '');
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** One line per payout with the fiat value at the time of payment. */
export function accountingCsv(r: RunRecord): string {
  const out = ['run,pay date,name,type,item,gross,deduction,net,currency,paid as,amount,rate,usd value,status,tx'];
  for (const i of r.items) for (const g of i.payouts) {
    out.push([r.label, r.payday, i.name, i.type, i.kind, i.gross, i.deduction, i.net, i.currency, optLabel(g.option), g.amount, g.lockedRate, g.usdValue, g.state === 'done' ? 'paid' : g.state, g.txHash ?? ''].map(csvCell).join(','));
  }
  return out.join('\n');
}

export function payslipText(r: RunRecord, i: RunItem): string {
  const t = [`${r.label} payslip`, `Paid ${r.payday}`, `${i.name} (${i.type})`, i.kind, `Gross: ${i.currency} ${i.gross}`];
  if (i.deduction !== '0' && !/^0(\.0+)?$/.test(i.deduction)) t.push(`Statutory deductions: ${i.currency} ${i.deduction}`);
  t.push(`Net: ${i.currency} ${i.net}`);
  for (const g of i.payouts) t.push(`Received: ${g.amountText} (${g.sub}), value US$ ${g.usdValue}, ${g.lockedRate}${g.txHash ? `, tx ${g.txHash}` : ''}`);
  return t.join('\n');
}

export { ccyOf };
