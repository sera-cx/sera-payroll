import type { Db } from '@sera-payroll/db';
import { auditLog } from '@sera-payroll/db';
import { uuid } from '../ids.js';

export async function audit(db: Db, e: { operatorId: string; clientId: string | null; actor: string; action: string; subject?: string | null; detail?: Record<string, unknown> }): Promise<void> {
  await db.insert(auditLog).values({ id: uuid(), operatorId: e.operatorId, clientId: e.clientId, actor: e.actor, action: e.action, subject: e.subject ?? null, detail: e.detail ?? {} });
}
