import { and, desc, eq } from 'drizzle-orm';
import { D, FIAT, type ClientSettings, type Fiat, type Plugins, type Ramps, type Schedule } from '@sera-payroll/core';
import { clients, operators, plugins as pluginsT, rampPartners, type Db } from '@sera-payroll/db';
import { notFound } from '../errors.js';

export type ClientRow = typeof clients.$inferSelect;
export type OperatorRow = typeof operators.$inferSelect;

export interface Tenant { client: ClientRow; operator: OperatorRow; settings: ClientSettings }

export function settingsOf(client: ClientRow, operator: OperatorRow): ClientSettings {
  return {
    twoPerson: client.settings.twoPerson, multisig: client.settings.multisig, schedule: client.settings.schedule as Schedule, gasPayer: client.settings.gasPayer,
    requireTestPayment: client.settings.requireTestPayment, feePercent: D(client.feePercent).toString(), addressHoldHours: operator.settings.addressHoldHours,
  };
}

export async function loadTenant(db: Db, clientId: string): Promise<Tenant> {
  const rows = await db.select({ c: clients, o: operators }).from(clients).innerJoin(operators, eq(clients.operatorId, operators.id)).where(eq(clients.id, clientId)).limit(1);
  const r = rows[0];
  if (!r) throw notFound('Client');
  return { client: r.c, operator: r.o, settings: settingsOf(r.c, r.o) };
}

export async function loadOperator(db: Db, operatorId: string): Promise<OperatorRow> {
  const o = (await db.select().from(operators).where(eq(operators.id, operatorId)).limit(1))[0];
  if (!o) throw notFound('Operator');
  return o;
}

export interface RampsView { ramps: Ramps; partners: Record<Fiat, { partner: string; adapter: string }> }

export async function loadRamps(db: Db, operatorId: string): Promise<RampsView> {
  const rows = await db.select().from(rampPartners).where(eq(rampPartners.operatorId, operatorId));
  const ramps = Object.fromEntries(FIAT.map((c) => [c, { onRamp: false, offRamp: false }])) as Ramps;
  const partners = Object.fromEntries(FIAT.map((c) => [c, { partner: '[PARTNER NAME]', adapter: 'mock' }])) as RampsView['partners'];
  for (const r of rows) {
    const c = r.currency as Fiat;
    if (!(c in ramps)) continue;
    ramps[c] = { onRamp: r.onRamp, offRamp: r.offRamp };
    partners[c] = { partner: r.partnerName, adapter: r.adapter };
  }
  return { ramps, partners };
}

export async function loadPlugins(db: Db, operatorId: string): Promise<{ plugins: Plugins; rows: (typeof pluginsT.$inferSelect)[] }> {
  const rows = await db.select().from(pluginsT).where(eq(pluginsT.operatorId, operatorId)).orderBy(desc(pluginsT.currency));
  const plugins: Plugins = {};
  for (const r of rows) plugins[r.currency as Fiat] = r.enabled;
  return { plugins, rows };
}

export function rampsJson(v: RampsView): Record<string, { onRamp: boolean; offRamp: boolean; partner: string }> {
  return Object.fromEntries(FIAT.map((c) => [c, { ...v.ramps[c], partner: v.partners[c].partner }]));
}

export async function setRamp(db: Db, operatorId: string, currency: Fiat, patch: { onRamp?: boolean; offRamp?: boolean }): Promise<void> {
  const existing = (await db.select().from(rampPartners).where(and(eq(rampPartners.operatorId, operatorId), eq(rampPartners.currency, currency))).limit(1))[0];
  if (existing) await db.update(rampPartners).set(patch).where(eq(rampPartners.id, existing.id));
  else await db.insert(rampPartners).values({ id: `ramp-${operatorId}-${currency}`, operatorId, currency, onRamp: patch.onRamp ?? false, offRamp: patch.offRamp ?? false });
}
