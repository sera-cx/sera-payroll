/**
 * In-browser stand-in for the API, built on the core engine and sample data.
 * A development aid only: it serves docs/API.md shapes so screens can be built and tested without the server.
 */
import {
  FIAT, FUNDING_OPTIONS, PAYOUT_OPTIONS, SAMPLE_CLIENTS, SAMPLE_PLUGINS, SAMPLE_RAMPS, SAMPLE_RATES, ccyOf, isBank, conv, fixed,
  buildRecord, lines, totals, rateLine, pathSteps, runInfo, employerSetAddress, employeeSetAddress, approvePending, cancelPending, setLocked, markTested,
  advancePayout, failPayout, retryPayout, accountingCsv, parsePayFile, importMessage, emptyWallet, patternScreening, sealPayslip, disclose as coreDisclose, keccak256Hex,
  type EngineContext, type Person as CorePerson, type AddressEvent, type PayoutOption, type Fiat, type RunRecord as CoreRecord, type WalletAddress,
} from './core-shim';
import type * as T from '../types';

interface ClientState { id: string; name: string; feePercent: string; treasuryWallet: string | null; ctx: EngineContext; people: Map<string, { p: CorePerson; email: string | null; history: AddressEvent[]; kyc: T.KycStatus }>; run: { id: string; preparedBy: T.RunView['preparedBy']; multisig: string[] }; records: (CoreRecord & { id: string; status: 'sent' | 'complete'; sentAt: string; by: string; signedWith: string; payslips: Map<string, T.PayslipRef> })[]; outbox: T.OutboxItem[] }

const users: T.DemoUser[] = [];
const clients = new Map<string, ClientState>();
const SK = 'sp.mock.session';
const readSession = (): string | null => { try { return sessionStorage.getItem(SK); } catch { return null; } };
let session: string | null = readSession();
const setSession = (v: string | null) => { session = v; try { if (v) sessionStorage.setItem(SK, v); else sessionStorage.removeItem(SK); } catch { /* ignore */ } };
let ramps: T.Ramps;
let plugins: Record<string, boolean>;
let apiKeys: T.ApiKey[] = [];
let webhooks: T.Webhook[] = [];
let n = 0;
const id = (p: string) => `${p}-${(++n).toString(36)}`;
const now = () => new Date().toISOString();

export function reset() {
  users.length = 0; clients.clear(); apiKeys = []; webhooks = []; n = 0;
  ramps = Object.fromEntries(FIAT.map((c) => [c, { ...SAMPLE_RAMPS[c], partner: '[PARTNER NAME]' }])) as T.Ramps;
  plugins = { ...SAMPLE_PLUGINS } as Record<string, boolean>;
  users.push({ id: 'u-op', name: 'Operator admin', email: 'ops@example.test', role: 'operator_admin', clientId: null, operatorId: 'op', personId: null });
  SAMPLE_CLIENTS.forEach((c, ci) => {
    const ctx: EngineContext = { people: [], run: { idx: 0, status: 'draft', fundingSource: c.fundingSource, oneOffs: [], skipped: [], funded: false }, settings: { ...c.settings }, ramps: SAMPLE_RAMPS, plugins: SAMPLE_PLUGINS, rates: { ...SAMPLE_RATES }, balances: { ...c.balances }, networkFeeUsd: '0.20', pluginRate: '0.10' };
    const cs: ClientState = { id: c.id, name: c.name, feePercent: c.settings.feePercent, treasuryWallet: null, ctx, people: new Map(), run: { id: id('run'), preparedBy: null, multisig: [] }, records: [], outbox: [] };
    for (const p of c.people) { const cp = structuredClone(p); ctx.people.push(cp); cs.people.set(p.id, { p: cp, email: null, history: cp.wallet.address ? [{ at: new Date(), actor: 'sample', action: cp.wallet.source === 'employer' ? 'Employer entered address' : 'Employee signed address', oldAddress: null, newAddress: cp.wallet.address }] : [], kyc: p.kycVerified ? 'verified' : 'not_started' }); }
    users.push({ id: `u-prep-${ci}`, name: `Preparer, ${c.name}`, email: null, role: 'preparer', clientId: c.id, operatorId: 'op', personId: null, clientName: c.name });
    users.push({ id: `u-appr-${ci}`, name: `Approver, ${c.name}`, email: null, role: 'approver', clientId: c.id, operatorId: 'op', personId: null, clientName: c.name });
    for (const p of c.people) users.push({ id: `u-${p.id}`, name: p.name, email: null, role: 'employee', clientId: c.id, operatorId: 'op', personId: p.id, clientName: c.name });
    clients.set(c.id, cs);
  });
  // Seed one past run for the first client, as the prototype does.
  const first = clients.get(SAMPLE_CLIENTS[0]!.id)!;
  const keep = first.ctx.people;
  first.ctx.people = keep.filter((p) => p.id !== 'p5');
  const rec = snapshot(first, 'Prepared by the preparer, approved by the approver', 'a single wallet');
  rec.label = 'October 2026'; rec.payday = '28 Oct 2026'; rec.sentAt = '2026-10-28T09:00:00.000Z';
  for (const i of rec.items) for (const g of i.payouts) if (g.state !== 'held') { g.state = 'done'; g.stageIndex = g.stages.length - 1; g.txHash = fakeHash(); }
  sealAll(first, rec);
  first.records.unshift(rec);
  first.ctx.people = keep;
}

function fakeHash() { let h = '0x'; for (let i = 0; i < 64; i++) h += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return h; }
const explorer = (tx: string | null) => (tx ? `https://sepolia.etherscan.io/tx/${tx}` : null);

export const me = (): T.Me => ({ user: users.find((u) => u.id === session) ?? (session ? (setSession(null), null) : null), demoMode: true, network: { name: 'sepolia', chainId: 11155111, explorer: 'https://sepolia.etherscan.io' } });
export const demoUsers = () => users;
export const login = (userId: string) => { if (!users.some((u) => u.id === userId)) throw err(404, 'not_found', 'No such user'); setSession(userId); };
export const logout = () => { setSession(null); };

export class MockError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const err = (s: number, c: string, m: string) => new MockError(s, c, m);
export const client = (cid: string) => { const c = clients.get(cid); if (!c) throw err(404, 'not_found', 'No such client'); c.ctx.ramps = Object.fromEntries(FIAT.map((f) => [f, { onRamp: ramps[f].onRamp, offRamp: ramps[f].offRamp }])) as EngineContext['ramps']; c.ctx.plugins = plugins; c.ctx.settings.feePercent = c.feePercent; return c; };
const user = () => { const u = users.find((x) => x.id === session); if (!u) throw err(401, 'unauthenticated', 'Sign in first'); return u; };

export function clientView(cid: string): T.Client {
  const c = client(cid);
  return { id: c.id, name: c.name, settings: settingsView(c), ramps, plugins, balances: c.ctx.balances, operator: { name: 'Sample Payroll Co', brand: '[YOUR PAYROLL BRAND]' } };
}
const settingsView = (c: ClientState): T.Settings => ({ ...c.ctx.settings, treasuryWallet: c.treasuryWallet, brand: '[YOUR PAYROLL BRAND]' });
export function patchSettings(cid: string, s: Partial<T.Settings>) {
  const c = client(cid);
  if (s.schedule && c.ctx.run.status !== 'draft') throw err(409, 'run_not_draft', 'The schedule can change while the current run is a draft.');
  const { feePercent: _f, addressHoldHours: _h, treasuryWallet: _t, brand: _b, ...rest } = s;
  Object.assign(c.ctx.settings, rest);
  return settingsView(c);
}

function personView(c: ClientState, pid: string): T.Person {
  const e = c.people.get(pid); if (!e) throw err(404, 'not_found', 'No such person');
  const w = e.p.wallet;
  return { ...e.p, email: e.email, kycStatus: e.kyc, wallet: { ...w, pending: w.pending ? { address: w.pending.address, source: w.pending.source, requestedAt: w.pending.requestedAt.toISOString(), liveAt: w.pending.liveAt.toISOString() } : null }, history: e.history.slice().reverse().map((h) => ({ ...h, at: h.at instanceof Date ? h.at.toISOString() : String(h.at) })) };
}
export const people = (cid: string, q = '') => Array.from(client(cid).people.keys()).map((pid) => personView(client(cid), pid)).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
export const person = (cid: string, pid: string) => personView(client(cid), pid);
export function addPerson(cid: string, b: { name: string; type: string; monthlyPay: string; currency: string; email?: string }) {
  const c = client(cid); const pid = id('p');
  const p: CorePerson = { id: pid, name: b.name, type: b.type as CorePerson['type'], monthlyPay: b.monthlyPay, currency: b.currency as Fiat, payoutPrimary: ({ USD: 'USDC', MYR: 'MYRT', SGD: 'XSGD', IDR: 'IDRT', JPY: 'JPYC' } as Record<string, PayoutOption>)[b.currency]!, payoutSecondary: null, splitPercent: 100, kycVerified: false, setupDone: false, wallet: emptyWallet('sepolia') };
  c.ctx.people.push(p); c.people.set(pid, { p, email: b.email ?? null, history: [], kyc: 'not_started' });
  users.push({ id: `u-${pid}`, name: p.name, email: b.email ?? null, role: 'employee', clientId: c.id, operatorId: 'op', personId: pid, clientName: c.name });
  return personView(c, pid);
}
export function editPerson(cid: string, pid: string, b: Partial<Pick<T.Person, 'name' | 'type' | 'monthlyPay' | 'email'>>) {
  const c = client(cid); const e = c.people.get(pid); if (!e) throw err(404, 'not_found', 'No such person');
  if (b.name) e.p.name = b.name; if (b.type) e.p.type = b.type; if (b.monthlyPay) e.p.monthlyPay = b.monthlyPay; if (b.email !== undefined) e.email = b.email;
  return personView(c, pid);
}
export function removePerson(cid: string, pid: string) { const c = client(cid); c.people.delete(pid); c.ctx.people = c.ctx.people.filter((p) => p.id !== pid); c.ctx.run.oneOffs = c.ctx.run.oneOffs.filter((x) => x.personId !== pid); }
export function importPeople(cid: string, text: string) {
  const c = client(cid);
  const r = parsePayFile(text, { names: c.ctx.people.map((p) => p.name), addresses: c.ctx.people.map((p) => p.wallet.address).filter((a): a is string => !!a) });
  const made = r.rows.map((row) => { const v = addPerson(cid, { name: row.name, type: row.type, monthlyPay: row.monthlyPay, currency: row.currency }); if (row.address) { const e = c.people.get(v.id)!; const t = employerSetAddress(e.p.wallet, row.address, 'import'); e.p.wallet = t.wallet; e.history.push(t.event); void screen(e); } return personView(c, v.id); });
  return { imported: r.rows.length, rejected: r.rejected, message: importMessage(r), people: made };
}
async function screen(e: { p: CorePerson }) { if (!e.p.wallet.address) return; const s = await patternScreening.screen(e.p.wallet.address as `0x${string}`, 'sepolia'); e.p.wallet.screening = s.status; e.p.wallet.screeningReason = s.reason; }
export function invite(cid: string, pid: string) { const c = client(cid); const p = personView(c, pid); mail(c, p.name, 'You are invited to set up how you get paid', 'invite'); return { url: `${location.origin}${import.meta.env.BASE_URL}invite/demo-${pid}`, expiresAt: new Date(Date.now() + 7 * 86400e3).toISOString() }; }
function mail(c: ClientState, to: string, subject: string, kind: string) { c.outbox.unshift({ id: id('m'), at: now(), to, subject, kind }); }
export const outbox = (cid: string) => client(cid).outbox;

function applyT(c: ClientState, pid: string, f: (w: WalletAddress) => { wallet: WalletAddress; event: AddressEvent } | { wallet: WalletAddress; event: AddressEvent }[]) {
  const e = c.people.get(pid); if (!e) throw err(404, 'not_found', 'No such person');
  try {
    const r = f(e.p.wallet); const list = Array.isArray(r) ? r : [r];
    for (const t of list) { e.p.wallet = t.wallet; e.history.push(t.event); }
  } catch (x) { if (x instanceof Error && 'code' in x) throw err(409, String((x as { code: string }).code), x.message); throw x; }
  void screen(e);
  return personView(c, pid);
}
export const setAddress = (cid: string, pid: string, a: string) => applyT(client(cid), pid, (w) => employerSetAddress(w, a, user().name));
export const lock = (cid: string, pid: string, locked: boolean) => applyT(client(cid), pid, (w) => setLocked(w, locked, user().name));
export const approveP = (cid: string, pid: string) => applyT(client(cid), pid, (w) => approvePending(w, user().name));
export const rejectP = (cid: string, pid: string) => applyT(client(cid), pid, (w) => cancelPending(w, user().name));
export const testPay = (cid: string, pid: string) => applyT(client(cid), pid, (w) => markTested(w, user().name));

export function runView(cid: string): T.RunView {
  const c = client(cid);
  const ctx = c.ctx; const L = lines(ctx); const t = totals(ctx, L); const inf = runInfo(ctx.settings.schedule, ctx.run.idx);
  const fund = ctx.run.fundingSource;
  const funding: T.FundingState = t.funding.kind === 'bank' ? { ...t.funding, deposit: { reference: `PAYRUN-${ctx.run.idx + 1}`, beneficiary: '[ON-RAMP PARTNER ACCOUNT]', accountDetails: { 'Account number': '000-000-000', Bank: 'Sample Bank' }, amount: fixed(t.need, t.fundingCurrency), currency: t.fundingCurrency } } : t.funding;
  const approval = ctx.settings.twoPerson && ctx.run.status !== 'submitted' ? undefined : { domain: { name: '[YOUR PAYROLL BRAND] Payroll', version: '1', chainId: 11155111, verifyingContract: '0x0000000000000000000000000000000000000000' }, types: { PayRunApproval: [{ name: 'runId', type: 'bytes32' }, { name: 'clientId', type: 'bytes32' }, { name: 'fundingAsset', type: 'string' }, { name: 'totalMinor', type: 'uint256' }, { name: 'payoutCount', type: 'uint32' }, { name: 'payoutsRoot', type: 'bytes32' }, { name: 'ratesLockedAt', type: 'uint64' }] }, primaryType: 'PayRunApproval', message: { runId: keccak256Hex(c.run.id), clientId: keccak256Hex(c.id), fundingAsset: fund, totalMinor: String(Math.round(Number(t.need) * 100)), payoutCount: t.count, payoutsRoot: keccak256Hex(JSON.stringify(L.length)), ratesLockedAt: Math.floor(Date.now() / 1000) } };
  return {
    id: c.run.id, idx: ctx.run.idx, status: ctx.run.status, label: inf.label, payday: inf.paydayText, schedule: ctx.settings.schedule, per: inf.per, fundingSource: fund,
    fundingOptions: FUNDING_OPTIONS.map((o) => ({ option: o, enabled: !isBank(o) || ramps[ccyOf(o)].onRamp, reason: isBank(o) && !ramps[ccyOf(o)].onRamp ? 'no on-ramp connected' : undefined })),
    funded: ctx.run.funded, preparedBy: c.run.preparedBy, approvedBy: null, sentAt: null,
    lines: L.map((l) => ({ personId: l.person.id, name: l.person.name, type: l.person.type, kind: l.kind, currency: l.currency, gross: fixed(l.gross, l.currency), deduction: fixed(l.deduction, l.currency), net: fixed(l.net, l.currency), skipped: l.skipped, oneOffId: l.oneOffId, legs: l.legs.map((g) => ({ option: g.option, sharePercent: g.sharePercent, amount: fixed(g.amount, ccyOf(g.option)), issue: g.issue, flagged: g.flagged, rateLine: rateLine(fund, g.option, ctx.rates), path: pathSteps(fund, g.option) })) })),
    totals: { fundingCurrency: t.fundingCurrency, fundingAsset: t.fundingAsset, payouts: fixed(t.payouts, t.fundingCurrency), count: t.count, swaps: t.swaps, toBank: t.toBank, toWallet: t.toWallet, issues: t.issues, held: t.held, fee: fixed(t.fee, t.fundingCurrency), feePercent: ctx.settings.feePercent, gas: fixed(t.gas, t.fundingCurrency), need: fixed(t.need, t.fundingCurrency), funding, ready: t.ready, canSend: t.canSend },
    rates: ctx.rates, ratesAsOf: now(), rateSource: 'sample', approval, multisig: ctx.settings.multisig ? { threshold: 2, collected: c.run.multisig } : undefined,
  };
}
const draftOnly = (c: ClientState) => { if (c.ctx.run.status !== 'draft') throw err(409, 'run_not_draft', 'This run is no longer a draft.'); };
export function patchRun(cid: string, b: { fundingSource?: string; funded?: boolean }) { const c = client(cid); draftOnly(c); if (b.fundingSource) { c.ctx.run.fundingSource = b.fundingSource as PayoutOption; c.ctx.run.funded = false; } if (b.funded !== undefined) c.ctx.run.funded = b.funded; return runView(cid); }
export function addOneOff(cid: string, b: { personId: string; amount: string; currency: string; kind: string }) { const c = client(cid); draftOnly(c); c.ctx.run.oneOffs.push({ id: id('x'), personId: b.personId, amount: b.amount, currency: b.currency as Fiat, kind: b.kind as 'Bonus' }); return runView(cid); }
export function removeOneOff(cid: string, xid: string) { const c = client(cid); draftOnly(c); c.ctx.run.oneOffs = c.ctx.run.oneOffs.filter((x) => x.id !== xid); return runView(cid); }
export function skip(cid: string, pid: string, skipped: boolean) { const c = client(cid); draftOnly(c); c.ctx.run.skipped = c.ctx.run.skipped.filter((x) => x !== pid); if (skipped) c.ctx.run.skipped.push(pid); return runView(cid); }
export function topup(cid: string) { const c = client(cid); const t = totals(c.ctx); const short = t.funding.kind === 'wallet' ? Number(t.funding.shortBy) : 0; const k = c.ctx.run.fundingSource; c.ctx.balances[k] = String(Number(c.ctx.balances[k] ?? 0) + Math.ceil(short / 100) * 100 + 100); return runView(cid); }
export function confirmFunds(cid: string) { const c = client(cid); c.ctx.run.funded = true; return runView(cid); }
export function submit(cid: string) { const c = client(cid); const t = totals(c.ctx); if (!t.ready) throw err(409, 'not_ready', 'Fix the issues in the list first.'); c.ctx.run.status = 'submitted'; c.run.preparedBy = { id: user().id, name: user().name }; mail(c, 'Approver', `Pay run ${runInfo(c.ctx.settings.schedule, c.ctx.run.idx).label} is waiting for your signature`, 'run.submitted'); return runView(cid); }
export function unsubmit(cid: string) { const c = client(cid); c.ctx.run.status = 'draft'; c.run.multisig = []; return runView(cid); }
export function multisigSign(cid: string, signer: string) { const c = client(cid); if (!c.run.multisig.includes(signer)) c.run.multisig.push(signer); return runView(cid); }

function snapshot(c: ClientState, by: string, signedWith: string) {
  const rec = buildRecord(c.ctx, (pid, i) => `${c.run.id}-${pid}-${i}`);
  return Object.assign(rec, { id: c.run.id, status: 'sent' as const, sentAt: now(), by, signedWith, payslips: new Map<string, T.PayslipRef>() });
}
const sealedSlips = new Map<string, ReturnType<typeof sealPayslip>>();
function sealAll(c: ClientState, rec: ClientState['records'][number]) {
  for (const i of rec.items) {
    if (rec.payslips.has(i.personId + i.kind)) continue;
    if (!i.payouts.every((g) => g.state === 'done' || g.state === 'held')) continue;
    const sealed = sealPayslip({ version: 1, runId: rec.id, runLabel: rec.label, payday: rec.payday, employer: '0x0000000000000000000000000000000000000001', employerName: c.name, personId: i.personId, personName: i.name, personType: i.type, kind: i.kind, currency: i.currency as Fiat, gross: i.gross, deduction: i.deduction, net: i.net, payouts: i.payouts.map((g) => ({ option: g.option, amount: g.amount, lockedRate: g.lockedRate, usdValue: g.usdValue, txHash: g.txHash as `0x${string}` | null, address: g.addressSnapshot as `0x${string}` | null, network: g.networkSnapshot })) }, () => fakeHash() as `0x${string}`);
    sealedSlips.set(rec.id + i.personId + i.kind, sealed);
    rec.payslips.set(i.personId + i.kind, { id: id('slip'), root: sealed.root, docHash: sealed.docHash, anchorTx: fakeHash(), anchorId: sealed.root, employerSignature: null, explorerUrl: null });
    const ps = rec.payslips.get(i.personId + i.kind)!; ps.explorerUrl = explorer(ps.anchorTx);
  }
}
export function approve(cid: string, b: { signature: string; simulateFailure?: boolean }) {
  const c = client(cid); const t = totals(c.ctx);
  if (!t.canSend) throw err(409, 'not_ready', 'The run is not ready to send.');
  if (c.ctx.settings.twoPerson && c.run.preparedBy?.id === user().id) throw err(403, 'same_person', 'The preparer cannot approve their own run.');
  if (c.ctx.settings.multisig && c.run.multisig.length < 2) throw err(409, 'signatures_missing', 'Two signatures are needed.');
  const rec = snapshot(c, c.ctx.settings.twoPerson ? 'Prepared by the preparer, approved by the approver' : 'Prepared and signed by one admin', c.ctx.settings.multisig ? 'a 2 of 3 multisig' : b.signature === 'demo' ? 'a demo signature' : 'a single wallet');
  if (!isBank(c.ctx.run.fundingSource)) c.ctx.balances[c.ctx.run.fundingSource] = String(Number(c.ctx.balances[c.ctx.run.fundingSource] ?? 0) - Number(rec.need));
  let first = true;
  for (const i of rec.items) for (const g of i.payouts) { if (g.state === 'held') continue; g.state = 'running'; if (b.simulateFailure && first) { (g as unknown as { willFail: boolean }).willFail = true; } first = false; }
  c.records.unshift(rec); c.ctx.run.status = 'sent';
  for (const i of rec.items) if (i.payouts.some((g) => g.state !== 'held')) mail(c, i.name, `You have been paid: ${i.kind.toLowerCase()} for ${rec.label}`, 'paid');
  startTicker();
  return recordView(c, rec);
}
let ticker: number | undefined;
function startTicker() { if (ticker) return; ticker = window.setInterval(tick, 1100); }
function tick() {
  let moving = false;
  for (const c of clients.values()) for (const rec of c.records) {
    for (const i of rec.items) i.payouts = i.payouts.map((g) => {
      if (g.state !== 'running' && g.state !== 'queued') return g;
      const wf = (g as unknown as { willFail?: boolean }).willFail;
      if (wf) { (g as unknown as { willFail?: boolean }).willFail = false; return failPayout(g, 'Network error (simulated). Nothing left the wallet for this payout.'); }
      const nx = advancePayout({ ...g, state: 'running' }, g.stageIndex + 1 >= g.stages.length - 1 ? fakeHash() : null);
      if (nx.state !== 'done') moving = true; return nx;
    });
    sealAll(c, rec);
    if (rec.items.every((i) => i.payouts.every((g) => g.state === 'done' || g.state === 'held'))) { rec.status = 'complete'; if (c.ctx.run.status === 'sent' && c.run.id === rec.id) c.ctx.run.status = 'complete'; }
  }
  if (!moving && ticker) { window.clearInterval(ticker); ticker = undefined; }
}
export function retry(cid: string, payoutId: string) {
  const c = client(cid);
  for (const rec of c.records) for (const i of rec.items) { const k = i.payouts.findIndex((g) => g.id === payoutId); if (k >= 0) { try { i.payouts[k] = { ...retryPayout(i.payouts[k]!), state: 'running' }; } catch (x) { throw err(409, 'not_failed', (x as Error).message); } rec.status = 'sent'; startTicker(); return payoutView(i.payouts[k]!); } }
  throw err(404, 'not_found', 'No such payout');
}
const payoutView = (g: CoreRecord['items'][number]['payouts'][number]): T.PayoutView => ({ ...g, explorerUrl: explorer(g.txHash) });
function recordView(c: ClientState, rec: ClientState['records'][number]): T.RunRecord {
  return { id: rec.id, label: rec.label, payday: rec.payday, fundingSource: rec.fundingSource, need: rec.need, fee: rec.fee, gas: rec.gas, count: rec.count, swaps: rec.swaps, held: rec.held, status: rec.status, sentAt: rec.sentAt, by: rec.by, signedWith: rec.signedWith, items: rec.items.map((i) => ({ ...i, currency: i.currency as Fiat, payouts: i.payouts.map(payoutView), payslip: rec.payslips.get(i.personId + i.kind) ?? null })) };
}
export const runs = (cid: string) => { const c = client(cid); return c.records.map((r) => recordView(c, r)); };
export const runRecord = (cid: string, rid: string) => { const c = client(cid); const r = c.records.find((x) => x.id === rid); if (!r) throw err(404, 'not_found', 'No such run'); return recordView(c, r); };
export const exportCsv = (cid: string, rid: string) => { const c = client(cid); const r = c.records.find((x) => x.id === rid); if (!r) throw err(404, 'not_found', 'No such run'); return accountingCsv(r); };
/** "Draft the next run": called through GET current when the current one is sent or complete and the user asks for the next. */
export function nextRun(cid: string) { const c = client(cid); if (c.ctx.run.status === 'sent' || c.ctx.run.status === 'complete') { c.ctx.run = { idx: c.ctx.run.idx + 1, status: 'draft', fundingSource: c.ctx.run.fundingSource, oneOffs: [], skipped: [], funded: false }; c.run = { id: id('run'), preparedBy: null, multisig: [] }; } return runView(cid); }

/* employee */
function myClient() { const u = user(); if (!u.personId || !u.clientId) throw err(403, 'forbidden', 'Not an employee account'); return { c: client(u.clientId), pid: u.personId }; }
export function meView(): T.MeView {
  const { c, pid } = myClient(); const p = personView(c, pid); const e = c.people.get(pid)!.p;
  return { ...p, client: { name: c.name, brand: '[YOUR PAYROLL BRAND]' }, ramps, rates: c.ctx.rates, payoutOptions: PAYOUT_OPTIONS.map((o) => { const ok = !isBank(o) || ramps[ccyOf(o)].offRamp; return { option: o, enabled: ok, reason: ok ? undefined : 'No off-ramp partner connected', estimate: fixed(conv(e.monthlyPay, e.currency, ccyOf(o), c.ctx.rates), ccyOf(o)) }; }) };
}
export function setPayout(b: { payoutPrimary?: string; payoutSecondary?: string | null; splitPercent?: number }) {
  const { c, pid } = myClient(); const e = c.people.get(pid)!.p;
  if (b.payoutPrimary) { e.payoutPrimary = b.payoutPrimary as PayoutOption; if (e.payoutSecondary === e.payoutPrimary) e.payoutSecondary = null; e.setupDone = true; }
  if (b.payoutSecondary !== undefined) e.payoutSecondary = b.payoutSecondary as PayoutOption | null;
  if (b.splitPercent !== undefined) e.splitPercent = b.splitPercent;
  if (!e.payoutSecondary) e.splitPercent = 100;
  return personView(c, pid);
}
const nonces = new Map<string, string>();
export function challenge(address: string) { const { c, pid } = myClient(); const nonce = id('n'); nonces.set(nonce, address.toLowerCase()); return { nonce, message: `[YOUR PAYROLL BRAND] wants you to prove you control this wallet address for salary payouts.\n\nAddress: ${address}\nNetwork: sepolia\nPerson: ${pid}\nClient: ${c.id}\nNonce: ${nonce}\nIssued at: ${now()}\n\nSigning costs nothing and moves no funds.` }; }
export function signAddress(b: { address: string; signature: string; nonce: string }) {
  const { c, pid } = myClient(); if (nonces.get(b.nonce) !== b.address.toLowerCase()) throw err(400, 'bad_nonce', 'Challenge expired. Try again.'); nonces.delete(b.nonce);
  const r = applyT(c, pid, (w) => employeeSetAddress(w, b.address, 'employee_signed', c.ctx.settings.addressHoldHours, user().name, b.signature)); afterChange(c, pid); return r;
}
export function pasteAddress(a: string) { const { c, pid } = myClient(); const r = applyT(c, pid, (w) => employeeSetAddress(w, a, 'employee_pasted', c.ctx.settings.addressHoldHours, user().name)); afterChange(c, pid); return r; }
function afterChange(c: ClientState, pid: string) { const e = c.people.get(pid)!; e.p.setupDone = true; if (e.p.wallet.pending) { mail(c, 'Employer admin', `${e.p.name} asked to change their wallet address`, 'address.change_requested'); mail(c, e.p.name, 'Your wallet address change was requested. Cancel it if this was not you', 'address.change_requested_employee'); } }
export function cancelMine() { const { c, pid } = myClient(); return applyT(c, pid, (w) => cancelPending(w, user().name)); }
export function startKyc() { const { c, pid } = myClient(); const e = c.people.get(pid)!; e.kyc = 'verified'; e.p.kycVerified = true; e.p.setupDone = true; return { url: 'demo:verified' }; }
export function myPayslips(): T.MyPayslip[] {
  const { c, pid } = myClient();
  const out: T.MyPayslip[] = [];
  for (const r of c.records) for (const i of r.items) if (i.personId === pid) { const ps = r.payslips.get(i.personId + i.kind); out.push({ runId: r.id, label: r.label, payday: r.payday, kind: i.kind, gross: i.gross, deduction: i.deduction, net: i.net, currency: i.currency as Fiat, payouts: i.payouts.map(payoutView), payslip: ps ? { root: ps.root, anchorTx: ps.anchorTx, explorerUrl: ps.explorerUrl ?? null } : null }); }
  return out;
}
export function disclose(runId: string, fields: string[]): T.Disclosure {
  const { c, pid } = myClient(); const r = c.records.find((x) => x.id === runId); const i = r?.items.find((x) => x.personId === pid); const ps = r && i ? r.payslips.get(i.personId + i.kind) : null;
  const sealed = r && i ? sealedSlips.get(r.id + i.personId + i.kind) : null;
  if (!r || !i || !ps || !sealed) throw err(404, 'not_found', 'No sealed payslip for that run yet.');
  const d = coreDisclose(sealed, fields.length ? fields : ['net', 'payday']);
  return { root: d.root, fields: d.fields, anchorTx: ps.anchorTx, explorerUrl: ps.explorerUrl ?? null, employerSignature: null, chainId: 11155111, registry: null, anchorId: ps.anchorId, runId: r.id, personId: pid, payday: r.payday };
}
export const inviteInfo = (token: string) => { const pid = token.replace(/^demo-/, ''); for (const c of clients.values()) if (c.people.has(pid)) return { personName: c.people.get(pid)!.p.name, clientName: c.name, brand: '[YOUR PAYROLL BRAND]' }; throw err(404, 'not_found', 'This invite is not valid.'); };
export const acceptInvite = (token: string, email: string) => { const pid = token.replace(/^demo-/, ''); const u = users.find((x) => x.personId === pid); if (!u) throw err(404, 'not_found', 'This invite is not valid.'); u.email = email; setSession(u.id); };

/* operator */
export const operator = (): T.OperatorView => ({ id: 'op', name: 'Sample Payroll Co', brand: '[YOUR PAYROLL BRAND]', settings: { addressHoldHours: 48, demoMode: true }, clients: Array.from(clients.values()).map((c) => ({ id: c.id, name: c.name, feePercent: c.feePercent, peopleCount: c.people.size, treasuryWallet: c.treasuryWallet })) });
export function addClient(b: { name: string; feePercent: string }) { const cid = id('client'); const first = SAMPLE_CLIENTS[0]!; clients.set(cid, { id: cid, name: b.name, feePercent: b.feePercent, treasuryWallet: null, ctx: { people: [], run: { idx: 0, status: 'draft', fundingSource: 'USDT', oneOffs: [], skipped: [], funded: false }, settings: { ...first.settings, feePercent: b.feePercent, twoPerson: false }, ramps: SAMPLE_RAMPS, plugins: SAMPLE_PLUGINS, rates: { ...SAMPLE_RATES }, balances: { USDT: '10000' }, networkFeeUsd: '0.20', pluginRate: '0.10' }, people: new Map(), run: { id: id('run'), preparedBy: null, multisig: [] }, records: [], outbox: [] }); users.push({ id: `u-prep-${cid}`, name: `Preparer, ${b.name}`, email: null, role: 'preparer', clientId: cid, operatorId: 'op', personId: null, clientName: b.name }); return operator().clients.find((c) => c.id === cid)!; }
export function editClient(cid: string, b: { name?: string; feePercent?: string; treasuryWallet?: string | null }) { const c = client(cid); if (b.name) c.name = b.name; if (b.feePercent) c.feePercent = b.feePercent; if (b.treasuryWallet !== undefined) c.treasuryWallet = b.treasuryWallet || null; return operator().clients.find((x) => x.id === cid)!; }
export const rampsView = () => ramps;
export const setRamp = (ccy: string, b: { onRamp?: boolean; offRamp?: boolean }) => { Object.assign(ramps[ccy as Fiat], b); return ramps; };
export const pluginsView = (): T.PluginView[] => [['MYR', 'Malaysia'], ['SGD', 'Singapore'], ['IDR', 'Indonesia']].map(([c, country]) => ({ currency: c as Fiat, country: country!, enabled: !!plugins[c!], plugin: 'flat-sample' }));
export const setPlugin = (ccy: string, on: boolean) => { plugins[ccy] = on; return pluginsView(); };
export const apiKeysView = () => apiKeys.map(({ key: _k, ...k }) => k);
export const addApiKey = (label: string) => { const k = { id: id('key'), label, key: `sp_demo_${fakeHash().slice(2, 34)}`, createdAt: now() }; apiKeys.push(k); return k; };
export const delApiKey = (kid: string) => { apiKeys = apiKeys.filter((k) => k.id !== kid); };
export const webhooksView = () => webhooks.map(({ secret: _s, ...w }) => w);
export const addWebhook = (b: { url: string; events: string[] }) => { const w = { id: id('wh'), url: b.url, events: b.events, secret: `whsec_${fakeHash().slice(2, 34)}`, createdAt: now() }; webhooks.push(w); return w; };
export const delWebhook = (wid: string) => { webhooks = webhooks.filter((w) => w.id !== wid); };
export const deliveries = (): T.Delivery[] => [];

reset();
