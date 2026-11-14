import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => { await h.close(); });

describe('auth and role checks', () => {
  it('needs a session', async () => {
    expect((await h.get('/clients/client-studio', '')).status).toBe(401);
    expect((await h.get('/me', '')).status).toBe(401);
  });
  it('demo users list exists only in demo mode', async () => {
    const r = await h.get('/auth/demo/users', '');
    expect(r.status).toBe(200);
    expect(r.body.some((u: { role: string }) => u.role === 'operator_admin')).toBe(true);
  });
  it('an employee cannot hit employer routes; employer cannot hit /me; scoping by client holds', async () => {
    const emp = await h.as('u-sample-studio-aisyah-rahman');
    expect((await h.get('/clients/client-studio/people', emp)).status).toBe(403);
    const prep = await h.as('u-sample-studio-preparer');
    expect((await h.get('/me', prep)).status).toBe(403);
    expect((await h.get('/clients/client-labs/people', prep)).status).toBe(403);
    expect((await h.get('/clients/client-studio/people', prep)).status).toBe(200);
    expect((await h.get('/operator', prep)).status).toBe(403);
    const op = await h.as('u-operator');
    expect((await h.get('/clients/client-labs/people', op)).status).toBe(200);
    expect((await h.get('/operator', op)).status).toBe(200);
  });
  it('preparer cannot approve, approver cannot submit, and the preparer of a run cannot approve it even as an operator admin', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const appr = await h.as('u-sample-studio-approver');
    const run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    await h.send('POST', '/clients/client-studio/runs/current/skip', prep, { personId: 'p5', skipped: true });
    await h.send('POST', '/clients/client-studio/runs/current/topup', prep);
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, appr)).status).toBe(403);
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, prep, { signature: 'demo' }, { 'idempotency-key': 'x' })).status).toBe(403);
    const sub = await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, prep);
    expect(sub.status).toBe(200);
    expect(sub.body.status).toBe('submitted');
    // Operator admin who prepared would be blocked by assertApprover: emulate by stamping preparedBy to the operator user.
    const { payRuns } = await import('@sera-payroll/db');
    const { eq } = await import('drizzle-orm');
    await h.deps.db.update(payRuns).set({ preparedBy: 'u-operator' }).where(eq(payRuns.id, run.id));
    const op = await h.as('u-operator');
    const r = await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, op, { signature: 'demo' }, { 'idempotency-key': 'y' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('same_person');
  });
  it('API keys act as operator admin and can be revoked', async () => {
    const op = await h.as('u-operator');
    const k = await h.send('POST', '/operator/api-keys', op, { label: 'ci' });
    expect(k.status).toBe(201);
    expect(k.body.key).toMatch(/^spk_/);
    const r = await h.app.inject({ method: 'GET', url: '/v1/clients/client-labs/people', headers: { authorization: `Bearer ${k.body.key}` } });
    expect(r.statusCode).toBe(200);
    expect((await h.send('DELETE', `/operator/api-keys/${k.body.id}`, op)).status).toBe(204);
    const r2 = await h.app.inject({ method: 'GET', url: '/v1/clients/client-labs/people', headers: { authorization: `Bearer ${k.body.key}` } });
    expect(r2.statusCode).toBe(401);
  });
});
