import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_PAY_FILE } from '@sera-payroll/core';
import { harness, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => { await h.close(); });

describe('retry idempotency', () => {
  it('a simulated failure can be retried once; a repeated retry with the same key is replayed, not re-run; settlement never pays twice', async () => {
    const op = await h.as('u-operator');
    const prep = await h.as('u-sample-studio-preparer');
    const appr = await h.as('u-sample-studio-approver');
    await h.send('POST', '/clients/client-studio/runs/current/skip', prep, { personId: 'p5', skipped: true });
    const run = (await h.send('POST', '/clients/client-studio/runs/current/topup', prep)).body;
    await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, prep);
    const sent = await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature: 'demo', simulateFailure: true }, { 'idempotency-key': 'f1' });
    expect(sent.status).toBe(200);
    await h.worker.drain();
    let rec = (await h.get(`/clients/client-studio/runs/${run.id}`, appr)).body;
    expect(rec.status).toBe('sent');
    expect(rec.statusText).toBe('1 failed');
    const failed = rec.items.flatMap((i: { payouts: { id: string; state: string; failureReason: string }[] }) => i.payouts).find((p: { state: string }) => p.state === 'failed');
    expect(failed.failureReason).toMatch(/simulated/);
    // A non-failed payout cannot be retried
    const done = rec.items.flatMap((i: { payouts: { id: string; state: string }[] }) => i.payouts).find((p: { state: string }) => p.state === 'done');
    expect((await h.send('POST', `/clients/client-studio/payouts/${done.id}/retry`, appr, undefined, { 'idempotency-key': 'nope' })).status).toBe(409);
    // Retry
    const r1 = await h.send('POST', `/clients/client-studio/payouts/${failed.id}/retry`, appr, undefined, { 'idempotency-key': 'r1' });
    expect(r1.status).toBe(200);
    expect(r1.body.state).toBe('queued');
    const r2 = await h.send('POST', `/clients/client-studio/payouts/${failed.id}/retry`, appr, undefined, { 'idempotency-key': 'r1' });
    expect(r2.body).toEqual(r1.body);
    await h.worker.drain();
    rec = (await h.get(`/clients/client-studio/runs/${run.id}`, appr)).body;
    expect(rec.status).toBe('complete');
    const after = rec.items.flatMap((i: { payouts: { id: string; state: string; attempts: number }[] }) => i.payouts).find((p: { id: string }) => p.id === failed.id);
    expect(after.state).toBe('done');
    expect(after.attempts).toBe(2);
    // A second retry now that it is done is refused, so nothing can pay twice
    expect((await h.send('POST', `/clients/client-studio/payouts/${failed.id}/retry`, appr, undefined, { 'idempotency-key': 'r2' })).status).toBe(409);
    // Audit trail has the approval
    const audit = (await h.get('/clients/client-studio/audit', op)).body;
    expect(audit.some((a: { action: string }) => a.action === 'run.approved')).toBe(true);
  });
});

describe('import and export', () => {
  it('imports the sample pay file, rejects bad rows, reports duplicates, screens addresses', async () => {
    const prep = await h.as('u-sample-labs-preparer');
    const r = await h.send('POST', '/clients/client-labs/people/import', prep, { text: SAMPLE_PAY_FILE + '\nChen Li Ting,1,SGD,,\n,5,MYR,,\nX,5,ZZZ,,' });
    expect(r.status).toBe(200);
    expect(r.body.imported).toBe(4);
    expect(r.body.rejected).toHaveLength(3);
    expect(r.body.rejected[0].reason).toMatch(/duplicate person/);
    const budi = r.body.people.find((p: { name: string }) => p.name === 'Budi Santoso');
    expect(budi.wallet.screening).toBe('flagged');
    expect(budi.type).toBe('Contractor');
    const siti = r.body.people.find((p: { name: string }) => p.name === 'Siti Aminah');
    expect(siti.wallet.source).toBe('employer');
    expect(siti.wallet.tested).toBe(false);
    expect(siti.payoutPrimary).toBe('MYRT');
  });
  it('people CRUD validates and scopes', async () => {
    const prep = await h.as('u-sample-labs-preparer');
    expect((await h.send('POST', '/clients/client-labs/people', prep, { name: 'Zero', monthlyPay: '0', currency: 'SGD' })).status).toBe(400);
    const p = await h.send('POST', '/clients/client-labs/people', prep, { name: 'Temp', monthlyPay: 100, currency: 'SGD' });
    expect(p.status).toBe(201);
    expect((await h.send('PATCH', `/clients/client-labs/people/${p.body.id}`, prep, { monthlyPay: '250.5' })).body.monthlyPay).toBe('250.5');
    expect((await h.send('DELETE', `/clients/client-studio/people/${p.body.id}`, await h.as('u-sample-studio-preparer'))).status).toBe(404);
    expect((await h.send('DELETE', `/clients/client-labs/people/${p.body.id}`, prep)).status).toBe(204);
  });
});
