import { and, eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { zeroAddress, type Address, type Hex } from 'viem';
import { PAYSLIP_TYPES, fixed, disclose, idToBytes32, payslipRegistryDomain, sealPayslip, type PayslipDocument, type PayoutOption, type Fiat, ccyOf } from '@sera-payroll/core';
import { payRuns, payouts, payslips, people, runLines, type Db } from '@sera-payroll/db';
import { notFound } from '../errors.js';
import { fakeTxHash, uuid } from '../ids.js';
import type { Deps } from './deps.js';
import { loadTenant } from './tenancy.js';

function randomSalt(): Hex { return fakeTxHash(); }

/** Seal, sign and anchor the payslip for one run line once all its payouts are final. Idempotent per line. */
export async function sealLine(deps: Deps, lineId: string): Promise<void> {
  const existing = (await deps.db.select().from(payslips).where(eq(payslips.lineId, lineId)).limit(1))[0];
  if (existing) return;
  const line = (await deps.db.select().from(runLines).where(eq(runLines.id, lineId)).limit(1))[0];
  if (!line) return;
  const run = (await deps.db.select().from(payRuns).where(eq(payRuns.id, line.runId)).limit(1))[0]!;
  const ps = await deps.db.select().from(payouts).where(eq(payouts.lineId, lineId));
  if (!ps.length || !ps.every((p) => p.state === 'done')) return;
  const t = await loadTenant(deps.db, line.clientId);
  const employer = (t.client.treasuryWallet ?? deps.signer.address) as Address;
  const payday = new Date(Date.parse(run.payDate + ' UTC'));
  const doc: PayslipDocument = {
    version: 1, runId: run.id, runLabel: run.label, payday: isNaN(payday.getTime()) ? run.payDate : payday.toISOString().slice(0, 10), employer, employerName: t.client.name,
    personId: line.personId, personName: line.personName, personType: line.personType as 'Employee' | 'Contractor', kind: line.kind, currency: line.currency as Fiat,
    gross: fixed(line.gross, line.currency as Fiat), deduction: fixed(line.deduction, line.currency as Fiat), net: fixed(line.net, line.currency as Fiat),
    payouts: ps.map((p) => ({ option: p.option as PayoutOption, amount: fixed(p.amount, ccyOf(p.option as PayoutOption)), lockedRate: p.lockedRate, usdValue: fixed(p.usdValue, 'USD'), txHash: (p.txHash ?? null) as Hex | null, address: (p.addressSnapshot ?? null) as Address | null, network: p.networkSnapshot })),
  };
  const sealed = sealPayslip(doc, randomSalt);
  const registry = (deps.config.PAYSLIP_REGISTRY_ADDRESS ?? zeroAddress) as Address;
  const paydaySec = BigInt(Math.floor((isNaN(payday.getTime()) ? Date.now() : payday.getTime()) / 1000));
  const signature = await deps.signer.signTypedData({
    domain: payslipRegistryDomain(deps.chain.chainId, registry), types: PAYSLIP_TYPES, primaryType: 'Payslip',
    message: { runId: idToBytes32(run.id), personId: idToBytes32(line.personId), payday: paydaySec, root: sealed.root, docHash: sealed.docHash },
  });
  let anchorTx: Hex | null = null, anchorId: Hex | null = null;
  try {
    const r = await deps.chain.anchorPayslip({ runId: run.id, personId: line.personId, payday: isNaN(payday.getTime()) ? new Date() : payday, root: sealed.root, docHash: sealed.docHash, employerSignature: signature }, deps.relay);
    anchorTx = r.txHash; anchorId = r.anchorId;
  } catch (e) {
    console.error('payslip anchor failed', e);
  }
  await deps.db.insert(payslips).values({ id: uuid(), runId: run.id, lineId, clientId: line.clientId, personId: line.personId, document: doc as unknown as Record<string, unknown>, leaves: sealed.leaves, root: sealed.root, docHash: sealed.docHash, employerSignature: signature, anchorTx, anchorId }).onConflictDoNothing();
  await deps.webhooks.emit(t.operator.id, 'payslip.anchored', { clientId: line.clientId, runId: run.id, personId: line.personId, root: sealed.root, anchorTx });
}

export async function getPayslip(db: Db, clientId: string, runId: string, personId: string) {
  const s = (await db.select().from(payslips).where(and(eq(payslips.clientId, clientId), eq(payslips.runId, runId), eq(payslips.personId, personId))).limit(1))[0];
  if (!s) throw notFound('Payslip');
  return s;
}

export function discloseFields(s: typeof payslips.$inferSelect, names: string[]) {
  const sealed = { doc: s.document as unknown as PayslipDocument, leaves: s.leaves as { name: string; value: string; salt: Hex }[], root: s.root as Hex, docHash: s.docHash as Hex };
  const d = disclose(sealed, names);
  return { root: d.root, anchorTx: s.anchorTx, employerSignature: s.employerSignature, fields: d.fields };
}

/** PDF payslip. Helvetica is fine; forks drop in Inter and their own brand. */
export async function payslipPdf(deps: Deps, clientId: string, runId: string, personId: string): Promise<Buffer> {
  const t = await loadTenant(deps.db, clientId);
  const line = (await deps.db.select().from(runLines).where(and(eq(runLines.runId, runId), eq(runLines.personId, personId), eq(runLines.clientId, clientId))).limit(1))[0];
  if (!line) throw notFound('Payslip');
  const run = (await deps.db.select().from(payRuns).where(eq(payRuns.id, runId)).limit(1))[0]!;
  const ps = await deps.db.select().from(payouts).where(eq(payouts.lineId, line.id));
  const slip = (await deps.db.select().from(payslips).where(eq(payslips.lineId, line.id)).limit(1))[0];
  const person = (await deps.db.select().from(people).where(eq(people.id, personId)).limit(1))[0];
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.rect(48, 40, 18, 18).fill('#00D26A');
  doc.fillColor('#0B0F0C').font('Helvetica-Bold').fontSize(20).text(t.operator.brand, 74, 40);
  doc.font('Helvetica').fontSize(10).fillColor('#4A5A50').text(t.client.name, 74, 64);
  doc.moveDown(2);
  doc.fillColor('#0B0F0C').font('Helvetica-Bold').fontSize(16).text(`${run.label} payslip`, 48, 100);
  doc.font('Helvetica').fontSize(11).text(`Paid ${run.payDate}`);
  doc.text(`${line.personName} (${line.personType})${person?.email ? `, ${person.email}` : ''}`);
  doc.text(line.kind);
  doc.moveDown();
  const kv = (k: string, v: string) => { doc.font('Helvetica').fillColor('#4A5A50').text(k, { continued: true }).fillColor('#0B0F0C').font('Helvetica-Bold').text(`  ${v}`, { align: 'right' }); };
  const cur = line.currency as Fiat;
  kv('Gross', `${line.currency} ${fixed(line.gross, cur)}`);
  if (Number(line.deduction) > 0) kv('Statutory deductions', `${line.currency} ${fixed(line.deduction, cur)}`);
  kv('Net', `${line.currency} ${fixed(line.net, cur)}`);
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(12).text('Received');
  doc.font('Helvetica').fontSize(10);
  for (const p of ps) {
    doc.moveDown(0.5);
    doc.text(`${p.amountText}  (${p.sub})`);
    doc.fillColor('#4A5A50').text(`Value when paid US$ ${fixed(p.usdValue, 'USD')}. ${p.lockedRate}. Status ${p.state}.`);
    if (p.swapTxHash) doc.text(`Swap on Sera.cx tx ${p.swapTxHash}`);
    if (p.txHash) doc.text(`tx ${p.txHash}`);
    doc.fillColor('#0B0F0C');
  }
  doc.moveDown();
  if (slip) {
    doc.font('Helvetica-Bold').fontSize(12).text('On-chain record');
    doc.font('Helvetica').fontSize(9).fillColor('#4A5A50');
    doc.text(`Payslip root ${slip.root}`);
    doc.text(`Document hash ${slip.docHash}`);
    if (slip.anchorTx) doc.text(`Anchored in ${deps.chain.explorerTxUrl(slip.anchorTx as Hex)}`);
    doc.text('Only hashes are on chain. Anyone holding this payslip and its salts can recompute the root and check the anchor. Fields can be disclosed one at a time with a Merkle proof.');
  }
  doc.fontSize(9).fillColor('#4A5A50').text('Settlement by Sera.cx', 48, 780, { align: 'center', width: 500 });
  doc.end();
  return done;
}
