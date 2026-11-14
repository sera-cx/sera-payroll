import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { harness, type Harness } from './harness.js';

let h: Harness;
let srv: Server;
const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
let url = '';
beforeAll(async () => {
  h = await harness();
  srv = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { received.push({ headers: req.headers, body: b }); res.statusCode = 200; res.end('ok'); }); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const addr = srv.address() as { port: number };
  url = `http://127.0.0.1:${addr.port}/hook`;
});
afterAll(async () => { await h.close(); srv.close(); });

describe('operator: webhooks, ramps, plug-ins, clients', () => {
  it('delivers signed webhooks for run and payout events', async () => {
    const op = await h.as('u-operator');
    const hook = await h.send('POST', '/operator/webhooks', op, { url, events: ['run.submitted', 'run.sent', 'payout.sent', 'payout.arrived', 'payslip.anchored', 'run.complete'] });
    expect(hook.status).toBe(201);
    const secret: string = hook.body.secret;
    expect((await h.send('POST', '/operator/webhooks', op, { url, events: ['nope'] })).status).toBe(400);
    const prep = await h.as('u-sample-studio-preparer');
    const appr = await h.as('u-sample-studio-approver');
    await h.send('POST', '/clients/client-studio/runs/current/skip', prep, { personId: 'p5', skipped: true });
    const run = (await h.send('POST', '/clients/client-studio/runs/current/topup', prep)).body;
    await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, prep);
    await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature: 'demo' }, { 'idempotency-key': 'w1' });
    await h.worker.drain();
    await h.deps.webhooks.drain();
    const events = received.map((r) => JSON.parse(r.body).event);
    expect(events).toContain('run.submitted');
    expect(events).toContain('run.sent');
    expect(events).toContain('payout.sent');
    expect(events).toContain('payslip.anchored');
    expect(events).toContain('run.complete');
    for (const r of received) {
      const sig = r.headers['x-sera-payroll-signature'] as string;
      expect(sig).toBe('sha256=' + createHmac('sha256', secret).update(r.body).digest('hex'));
    }
    const del = (await h.get(`/operator/webhooks/${hook.body.id}/deliveries`, op)).body;
    expect(del.length).toBeGreaterThan(3);
    expect(del.every((d: { status: string }) => d.status === 'delivered')).toBe(true);
  });
  it('turning a ramp off breaks bank payouts in the run; a plug-in deducts; fee changes totals', async () => {
    const op = await h.as('u-operator');
    await h.send('PATCH', '/operator/ramps/SGD', op, { offRamp: false });
    const prep = await h.as('u-sample-studio-preparer');
    let run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    const tan = run.lines.find((l: { personId: string }) => l.personId === 'p2');
    expect(tan.legs[0].issue).toMatch(/No off-ramp partner connected for SGD/);
    await h.send('PATCH', '/operator/ramps/SGD', op, { offRamp: true });
    await h.send('PATCH', '/operator/plugins/MYR', op, { enabled: true });
    run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    const aisyah = run.lines.find((l: { personId: string }) => l.personId === 'p1');
    expect(aisyah.deduction).toBe('850.00');
    expect(aisyah.net).toBe('7650.00');
    await h.send('PATCH', '/operator/plugins/MYR', op, { enabled: false });
    const before = Number(run.totals.fee);
    await h.send('PATCH', '/operator/clients/client-studio', op, { feePercent: '1' });
    run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    expect(Number(run.totals.fee)).toBeGreaterThan(before);
    expect(run.totals.feePercent).toBe('1');
    // Employer cannot change its own fee
    expect((await h.send('PATCH', '/clients/client-studio/settings', prep, { feePercent: '0' })).status).toBe(200);
    expect((await h.get('/clients/client-studio/runs/current', prep)).body.totals.feePercent).toBe('1');
  });
  it('creates a client and lists it with counts; demo reset reseeds', async () => {
    const op = await h.as('u-operator');
    const c = await h.send('POST', '/operator/clients', op, { name: 'New Co', feePercent: 0.25 });
    expect(c.status).toBe(201);
    const o = (await h.get('/operator', op)).body;
    expect(o.clients.some((x: { name: string }) => x.name === 'New Co')).toBe(true);
    expect(o.clients.find((x: { id: string }) => x.id === 'client-studio').peopleCount).toBe(5);
    expect((await h.send('POST', '/operator/demo/reset', op)).status).toBe(204);
    const op2 = await h.as('u-operator');
    expect((await h.get('/operator', op2)).body.clients).toHaveLength(3);
  });
  it('operator hold hours apply to new changes', async () => {
    const op = await h.as('u-operator');
    await h.send('PATCH', '/operator', op, { addressHoldHours: 24 });
    const emp = await h.as('u-sample-studio-aisyah-rahman');
    const r = await h.send('POST', '/me/address/paste', emp, { address: '0x4444444444444444444444444444444444444444' });
    expect(new Date(r.body.wallet.pending.liveAt).getTime() - h.clock.now.getTime()).toBe(24 * 3600_000);
  });
});

describe('employee preferences', () => {
  it('payout choice, split and verification hand-off', async () => {
    const emp = await h.as('u-sample-studio-daniel-lee'); // contractor, not verified
    let me = (await h.get('/me', emp)).body;
    expect(me.payoutOptions.find((o: { option: string }) => o.option === 'bank:IDR').enabled).toBe(false);
    expect((await h.send('PATCH', '/me/payout', emp, { payoutPrimary: 'bank:IDR' })).status).toBe(409);
    me = (await h.send('PATCH', '/me/payout', emp, { payoutPrimary: 'bank:MYR', payoutSecondary: 'USDT', splitPercent: 60 })).body;
    expect(me.payoutPrimary).toBe('bank:MYR');
    expect(me.splitPercent).toBe(60);
    expect(me.kycStatus).toBe('not_started');
    const prep = await h.as('u-sample-studio-preparer');
    let run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    const dan = run.lines.find((l: { personId: string }) => l.personId === 'p4');
    expect(dan.legs[0].issue).toMatch(/Not yet verified/);
    expect((await h.send('POST', '/me/verification/start', emp)).body.status).toBe('verified');
    expect((await h.get('/me/verification', emp)).body.status).toBe('verified');
    run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    expect(run.lines.find((l: { personId: string }) => l.personId === 'p4').legs[0].issue).toBeNull();
    me = (await h.send('PATCH', '/me/payout', emp, { payoutSecondary: null })).body;
    expect(me.splitPercent).toBe(100);
  });
});
