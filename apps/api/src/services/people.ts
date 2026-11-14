import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Address } from 'viem';
import {
  addressProofMessage, applyIfDue, approvePending as coreApprove, cancelPending as coreCancel, employeeSetAddress, employerSetAddress, markTested, setLocked, setScreening,
  isPayoutOption, D, type AddressEvent, type Fiat, type Network, type Person, type PayoutOption, type WalletAddress,
} from '@sera-payroll/core';
import { addressEvents, invites, people, users, walletAddresses, type Db } from '@sera-payroll/db';
import { badRequest, conflict, notFound } from '../errors.js';
import { token, uuid } from '../ids.js';
import type { Deps } from './deps.js';
import type { Tenant } from './tenancy.js';
import { audit } from './audit.js';

export type PersonRow = typeof people.$inferSelect;
export type WalletRow = typeof walletAddresses.$inferSelect;

export function toWallet(w: WalletRow | undefined): WalletAddress {
  if (!w) return { address: null, network: 'ethereum', source: null, signature: null, locked: false, tested: false, screening: 'unscreened', screeningReason: null, pending: null };
  return {
    address: w.address, network: w.network as Network, source: w.source as WalletAddress['source'], signature: w.signature, locked: w.locked, tested: w.tested,
    screening: w.screeningStatus as WalletAddress['screening'], screeningReason: w.screeningReason,
    pending: w.pending ? { address: w.pending.address, source: w.pending.source as 'employee_signed' | 'employee_pasted', requestedAt: new Date(w.pending.requestedAt), liveAt: new Date(w.pending.liveAt) } : null,
  };
}

export function toPerson(p: PersonRow, w: WalletRow | undefined): Person {
  return {
    id: p.id, name: p.name, type: p.type, monthlyPay: D(p.monthlyPay).toString(), currency: p.currency as Fiat, payoutPrimary: p.payoutPrimary as PayoutOption, payoutSecondary: p.payoutSecondary as PayoutOption | null,
    splitPercent: p.splitPercent, kycVerified: p.kycStatus === 'verified', setupDone: p.setupDone, wallet: toWallet(w),
  };
}

export interface PersonView extends Person { kycStatus: PersonRow['kycStatus']; email: string | null; history: AddressEvent[] }

export async function loadPeople(db: Db, clientId: string): Promise<{ rows: PersonRow[]; wallets: Map<string, WalletRow> }> {
  const rows = await db.select().from(people).where(eq(people.clientId, clientId)).orderBy(asc(people.createdAt), asc(people.id));
  const ws = rows.length ? await db.select().from(walletAddresses).where(inArray(walletAddresses.personId, rows.map((r) => r.id))) : [];
  return { rows, wallets: new Map(ws.map((w) => [w.personId, w])) };
}

export async function corePeople(db: Db, clientId: string): Promise<Person[]> {
  const { rows, wallets } = await loadPeople(db, clientId);
  return rows.map((r) => toPerson(r, wallets.get(r.id)));
}

export async function personViews(db: Db, clientId: string, q = ''): Promise<PersonView[]> {
  const { rows, wallets } = await loadPeople(db, clientId);
  const ids = rows.map((r) => r.id);
  const evs = ids.length ? await db.select().from(addressEvents).where(inArray(addressEvents.personId, ids)).orderBy(desc(addressEvents.at)) : [];
  const byPerson = new Map<string, AddressEvent[]>();
  for (const e of evs) { const arr = byPerson.get(e.personId) ?? []; arr.push({ at: e.at, actor: e.actor, action: e.action, oldAddress: e.oldAddress, newAddress: e.newAddress }); byPerson.set(e.personId, arr); }
  const qq = q.toLowerCase();
  return rows.filter((r) => !qq || r.name.toLowerCase().includes(qq)).map((r) => ({ ...toPerson(r, wallets.get(r.id)), kycStatus: r.kycStatus, email: r.email, history: byPerson.get(r.id) ?? [] }));
}

export async function personView(db: Db, clientId: string, personId: string): Promise<PersonView> {
  const v = (await personViews(db, clientId)).find((p) => p.id === personId);
  if (!v) throw notFound('Person');
  return v;
}

export async function getPersonRow(db: Db, clientId: string, personId: string): Promise<{ row: PersonRow; wallet: WalletRow }> {
  const row = (await db.select().from(people).where(and(eq(people.id, personId), eq(people.clientId, clientId))).limit(1))[0];
  if (!row) throw notFound('Person');
  let wallet = (await db.select().from(walletAddresses).where(eq(walletAddresses.personId, personId)).limit(1))[0];
  if (!wallet) { await db.insert(walletAddresses).values({ personId, clientId }); wallet = (await db.select().from(walletAddresses).where(eq(walletAddresses.personId, personId)).limit(1))[0]!; }
  return { row, wallet };
}

async function saveWallet(db: Db, personId: string, w: WalletAddress): Promise<void> {
  await db.update(walletAddresses).set({
    address: w.address, network: w.network, source: w.source, signature: w.signature, locked: w.locked, tested: w.tested, screeningStatus: w.screening, screeningReason: w.screeningReason,
    pending: w.pending ? { address: w.pending.address, source: w.pending.source, requestedAt: w.pending.requestedAt.toISOString(), liveAt: w.pending.liveAt.toISOString() } : null, updatedAt: new Date(),
  }).where(eq(walletAddresses.personId, personId));
}

async function logEvent(db: Db, personId: string, clientId: string, e: AddressEvent): Promise<void> {
  await db.insert(addressEvents).values({ id: uuid(), personId, clientId, actor: e.actor, action: e.action, oldAddress: e.oldAddress, newAddress: e.newAddress, at: e.at });
}

/** Screen a (new) address and record the result on the wallet. Flags are not blocking. */
async function screenAndSave(deps: Deps, personId: string, clientId: string, w: WalletAddress): Promise<WalletAddress> {
  if (!w.address) return w;
  const r = await deps.screening.screen(w.address as Address, w.network);
  const tr = setScreening(w, r.status, r.reason, deps.now());
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, clientId, tr.event);
  return tr.wallet;
}

async function employerContacts(db: Db, clientId: string): Promise<{ email: string | null; name: string }[]> {
  const rows = await db.select().from(users).where(and(eq(users.clientId, clientId), inArray(users.role, ['preparer', 'approver'])));
  return rows.map((u) => ({ email: u.email, name: u.name }));
}

function ctxErr(e: unknown): never {
  if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'locked') throw conflict('locked', (e as unknown as Error).message);
  if (e instanceof Error && e.name === 'AddressRuleError') throw badRequest((e as Error & { code: string }).code, e.message);
  throw e;
}

export async function employerEnterAddress(deps: Deps, t: Tenant, personId: string, address: string, actor: string): Promise<void> {
  const { row, wallet } = await getPersonRow(deps.db, t.client.id, personId);
  let tr; try { tr = employerSetAddress(toWallet(wallet), address, actor, deps.now()); } catch (e) { ctxErr(e); }
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, t.client.id, tr.event);
  await screenAndSave(deps, personId, t.client.id, tr.wallet);
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor, action: 'address.entered', subject: row.id, detail: { address: tr.wallet.address } });
}

export async function employeeSubmitAddress(deps: Deps, t: Tenant, personId: string, address: string, source: 'employee_signed' | 'employee_pasted', signature: string | null): Promise<void> {
  const { row, wallet } = await getPersonRow(deps.db, t.client.id, personId);
  let tr; try { tr = employeeSetAddress(toWallet(wallet), address, source, t.settings.addressHoldHours, row.id, signature, deps.now()); } catch (e) { ctxErr(e); }
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, t.client.id, tr.event);
  await deps.db.update(people).set({ setupDone: true, setupAt: row.setupAt ?? deps.now() }).where(eq(people.id, personId));
  const scope = { operatorId: t.operator.id, clientId: t.client.id };
  if (tr.wallet.pending) {
    for (const c of await employerContacts(deps.db, t.client.id)) await deps.notifier.send(c, 'address.change_requested', { personName: row.name, newAddress: tr.wallet.pending.address, liveAt: tr.wallet.pending.liveAt.toISOString() }, scope);
    await deps.notifier.send({ email: row.email, name: row.name }, 'address.change_requested_employee', { newAddress: tr.wallet.pending.address, liveAt: tr.wallet.pending.liveAt.toISOString() }, scope);
    await deps.webhooks.emit(t.operator.id, 'address.change_requested', { clientId: t.client.id, personId, newAddress: tr.wallet.pending.address, liveAt: tr.wallet.pending.liveAt.toISOString() });
  } else {
    await screenAndSave(deps, personId, t.client.id, tr.wallet);
  }
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: row.id, action: tr.wallet.pending ? 'address.change_requested' : 'address.set_by_employee', subject: row.id, detail: { address, source } });
}

export async function approvePendingAddress(deps: Deps, t: Tenant, personId: string, actor: string): Promise<void> {
  const { wallet } = await getPersonRow(deps.db, t.client.id, personId);
  let tr; try { tr = coreApprove(toWallet(wallet), actor, deps.now()); } catch (e) { ctxErr(e); }
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, t.client.id, tr.event);
  await screenAndSave(deps, personId, t.client.id, tr.wallet);
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor, action: 'address.change_approved', subject: personId, detail: { address: tr.wallet.address } });
}

export async function cancelPendingAddress(deps: Deps, t: Tenant, personId: string, actor: string): Promise<void> {
  const { wallet } = await getPersonRow(deps.db, t.client.id, personId);
  let tr; try { tr = coreCancel(toWallet(wallet), actor, deps.now()); } catch (e) { ctxErr(e); }
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, t.client.id, tr.event);
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor, action: 'address.change_cancelled', subject: personId });
}

export async function lockAddress(deps: Deps, t: Tenant, personId: string, locked: boolean, actor: string): Promise<void> {
  const { row, wallet } = await getPersonRow(deps.db, t.client.id, personId);
  const trs = setLocked(toWallet(wallet), locked, actor, deps.now());
  for (const tr of trs) { await saveWallet(deps.db, personId, tr.wallet); await logEvent(deps.db, personId, t.client.id, tr.event); }
  const scope = { operatorId: t.operator.id, clientId: t.client.id };
  await deps.notifier.send({ email: row.email, name: row.name }, 'address.locked', { personName: row.name, locked }, scope);
  await deps.webhooks.emit(t.operator.id, 'address.locked', { clientId: t.client.id, personId, locked });
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor, action: locked ? 'address.locked' : 'address.unlocked', subject: personId });
}

export async function testPayment(deps: Deps, t: Tenant, personId: string, actor: string): Promise<void> {
  const { row, wallet } = await getPersonRow(deps.db, t.client.id, personId);
  let tr; try { tr = markTested(toWallet(wallet), actor, deps.now()); } catch (e) { ctxErr(e); }
  await saveWallet(deps.db, personId, tr.wallet);
  await logEvent(deps.db, personId, t.client.id, tr.event);
  await deps.notifier.send({ email: row.email, name: row.name }, 'test_payment', { address: tr.wallet.address }, { operatorId: t.operator.id, clientId: t.client.id });
  await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor, action: 'address.test_payment', subject: personId });
}

/** Scheduler: apply pending changes whose hold has lapsed. Also run before reads so a stale server never shows a stale address. */
export async function applyDueChanges(deps: Deps, clientId?: string): Promise<number> {
  const rows = await deps.db.select().from(walletAddresses).where(clientId ? eq(walletAddresses.clientId, clientId) : undefined);
  let n = 0;
  for (const w of rows) {
    if (!w.pending) continue;
    const tr = applyIfDue(toWallet(w), deps.now());
    if (!tr) continue;
    await saveWallet(deps.db, w.personId, tr.wallet);
    await logEvent(deps.db, w.personId, w.clientId, tr.event);
    await screenAndSave(deps, w.personId, w.clientId, tr.wallet);
    const p = (await deps.db.select().from(people).where(eq(people.id, w.personId)).limit(1))[0];
    const op = (await deps.db.select({ operatorId: users.operatorId }).from(users).where(eq(users.clientId, w.clientId)).limit(1))[0];
    if (p && op) await deps.notifier.send({ email: p.email, name: p.name }, 'address.change_applied', { address: tr.wallet.address }, { operatorId: op.operatorId, clientId: w.clientId });
    n++;
  }
  return n;
}

export function challengeFor(brand: string, personId: string, clientId: string, address: string, network: Network, nonce: string, issuedAt: string): string {
  return addressProofMessage({ brand, personId, clientId, address, network, nonce, issuedAt });
}

export async function createInvite(db: Db, clientId: string, personId: string): Promise<{ token: string; expiresAt: Date }> {
  const t = token(24);
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(invites).values({ token: t, personId, clientId, expiresAt });
  await db.update(people).set({ invitedAt: new Date() }).where(eq(people.id, personId));
  return { token: t, expiresAt };
}

export function assertPayoutOption(o: unknown): PayoutOption {
  if (typeof o !== 'string' || !isPayoutOption(o)) throw badRequest('bad_option', 'Unknown payout option.');
  return o;
}
