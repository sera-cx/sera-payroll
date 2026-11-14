import type { NotificationKind } from '@sera-payroll/core';
import type { Db } from '@sera-payroll/db';
import { notifications } from '@sera-payroll/db';
import { uuid } from '../ids.js';

export type AnyKind = NotificationKind | 'magic_link' | 'test_payment' | 'address.change_applied' | 'run.approved';

export interface NotifyTarget { email: string | null; name: string }
export interface NotifyScope { operatorId: string; clientId: string | null }

export interface AppNotifier {
  send(to: NotifyTarget, kind: AnyKind, data: Record<string, unknown>, scope: NotifyScope): Promise<{ id: string }>;
}

export function subjectFor(kind: AnyKind, d: Record<string, unknown>): string {
  switch (kind) {
    case 'run.submitted': return `Pay run ${d.label} is waiting for your signature`;
    case 'run.sent': return `Pay run ${d.label} has been signed and sent`;
    case 'run.approved': return `Pay run ${d.label} was approved`;
    case 'paid': return `You have been paid: ${String(d.kind ?? 'salary').toLowerCase()} for ${d.label}`;
    case 'invite': return 'You are invited to set up how you get paid';
    case 'address.change_requested': return `${d.personName} asked to change their wallet address`;
    case 'address.change_requested_employee': return 'Your wallet address change was requested. Cancel it if this was not you';
    case 'address.change_applied': return 'Your wallet address change is now live';
    case 'address.locked': return `Wallet address ${d.locked ? 'locked' : 'unlocked'} for ${d.personName}`;
    case 'payout.failed': return `A payout in ${d.label} failed and can be retried`;
    case 'payout.held': return `A payout in ${d.label} was held by screening`;
    case 'magic_link': return 'Your sign-in link';
    case 'test_payment': return 'A test payment was sent to your wallet';
  }
}

/** Always writes the outbox row. Forks add a provider on top (see SmtpNotifier). */
export class OutboxNotifier implements AppNotifier {
  constructor(protected db: Db, protected provider = 'outbox') {}
  async send(to: NotifyTarget, kind: AnyKind, data: Record<string, unknown>, scope: NotifyScope): Promise<{ id: string }> {
    const id = uuid();
    await this.db.insert(notifications).values({ id, operatorId: scope.operatorId, clientId: scope.clientId, toEmail: to.email, toName: to.name, subject: subjectFor(kind, data), kind, data, provider: this.provider });
    return { id };
  }
}

export class SmtpNotifier extends OutboxNotifier {
  private transport: Promise<import('nodemailer').Transporter>;
  constructor(db: Db, smtpUrl: string, private from: string) {
    super(db, 'smtp');
    this.transport = import('nodemailer').then((m) => m.default.createTransport(smtpUrl));
  }
  override async send(to: NotifyTarget, kind: AnyKind, data: Record<string, unknown>, scope: NotifyScope): Promise<{ id: string }> {
    const r = await super.send(to, kind, data, scope);
    if (to.email) {
      try {
        const t = await this.transport;
        await t.sendMail({ from: this.from, to: to.email, subject: subjectFor(kind, data), text: renderText(kind, data) });
      } catch (e) {
        console.error('SMTP send failed', e);
      }
    }
    return r;
  }
}

export function renderText(kind: AnyKind, d: Record<string, unknown>): string {
  const lines = [subjectFor(kind, d), ''];
  if (d.url) lines.push(`Open: ${d.url}`);
  for (const [k, v] of Object.entries(d)) if (k !== 'url' && typeof v !== 'object') lines.push(`${k}: ${v}`);
  lines.push('', 'Settlement by Sera.cx');
  return lines.join('\n');
}
