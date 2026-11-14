import { eq } from 'drizzle-orm';
import type { Db } from '@sera-payroll/db';
import { webhookDeliveries, webhooks } from '@sera-payroll/db';
import { hmac, uuid } from '../ids.js';

/** Signed webhook delivery: POST JSON { id, event, at, data } with X-Sera-Payroll-Signature: sha256=<hmac>. */
export class WebhookService {
  pending: Promise<unknown>[] = [];
  constructor(private db: Db, private retries = 3, private f: typeof fetch = globalThis.fetch, private backoffMs = 500) {}

  async emit(operatorId: string, event: string, data: Record<string, unknown>): Promise<void> {
    const hooks = await this.db.select().from(webhooks).where(eq(webhooks.operatorId, operatorId));
    for (const h of hooks) {
      if (!h.events.includes(event) && !h.events.includes('*')) continue;
      const p = this.deliver(h.id, h.url, h.secret, event, data).catch(() => undefined);
      this.pending.push(p);
    }
  }

  static sign(secret: string, body: string): string { return `sha256=${hmac(secret, body)}`; }

  private async deliver(webhookId: string, url: string, secret: string, event: string, data: Record<string, unknown>): Promise<void> {
    const payload = { id: uuid(), event, at: new Date().toISOString(), data };
    const body = JSON.stringify(payload);
    let status = 'failed', code: number | null = null, attempts = 0;
    for (let i = 0; i <= this.retries; i++) {
      attempts++;
      try {
        const res = await this.f(url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Sera-Payroll-Signature': WebhookService.sign(secret, body), 'X-Sera-Payroll-Event': event }, body });
        code = res.status;
        if (res.ok) { status = 'delivered'; break; }
      } catch { code = null; }
      if (i < this.retries) await new Promise((r) => setTimeout(r, this.backoffMs * 2 ** i));
    }
    await this.db.insert(webhookDeliveries).values({ id: uuid(), webhookId, event, payload, status, responseCode: code, attempts });
  }

  /** Tests: wait for in-flight deliveries. */
  async drain(): Promise<void> { await Promise.all(this.pending.splice(0)); }
}
