import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { employeeAccount, harness, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => { await h.close(); });

const A = employeeAccount.address;

describe('address flow', () => {
  it('employee signs a first address: live at once, verified on the server', async () => {
    const emp = await h.as('u-sample-studio-putri-wulandari'); // p5 has no address
    const ch = await h.get(`/me/address/challenge?address=${A}`, emp);
    expect(ch.status).toBe(200);
    expect(ch.body.message).toContain(A);
    const sig = await employeeAccount.signMessage({ message: ch.body.message });
    const bad = await h.send('POST', '/me/address/sign', emp, { address: A, signature: sig.replace(/.$/, (c) => (c === '0' ? '1' : '0')), nonce: ch.body.nonce });
    expect(bad.status).toBe(401);
    const ch2 = await h.get(`/me/address/challenge?address=${A}`, emp);
    const sig2 = await employeeAccount.signMessage({ message: ch2.body.message });
    const ok = await h.send('POST', '/me/address/sign', emp, { address: A, signature: sig2, nonce: ch2.body.nonce });
    expect(ok.status).toBe(200);
    expect(ok.body.wallet.address).toBe(getAddress(A));
    expect(ok.body.wallet.source).toBe('employee_signed');
    expect(ok.body.wallet.pending).toBeNull();
    expect(ok.body.wallet.screening).toBe('clear');
    // nonce is single use
    expect((await h.send('POST', '/me/address/sign', emp, { address: A, signature: sig2, nonce: ch2.body.nonce })).status).toBe(401);
  });
  it('changing an address starts the hold, notifies both sides, employer can approve early, scheduler applies when due', async () => {
    const emp = await h.as('u-sample-studio-aisyah-rahman'); // p1 has an address
    const B = '0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f02';
    const r = await h.send('POST', '/me/address/paste', emp, { address: B });
    expect(r.status).toBe(200);
    expect(r.body.wallet.pending.address).toBe(getAddress(B));
    expect(new Date(r.body.wallet.pending.liveAt).getTime() - h.clock.now.getTime()).toBe(48 * 3600_000);
    const prep = await h.as('u-sample-studio-preparer');
    const out = (await h.get('/clients/client-studio/outbox', prep)).body;
    expect(out.some((m: { subject: string }) => /asked to change/.test(m.subject))).toBe(true);
    expect(out.some((m: { subject: string }) => /Cancel it if this was not you/.test(m.subject))).toBe(true);
    // employee cancels
    expect((await h.send('POST', '/me/address/cancel', emp)).body.wallet.pending).toBeNull();
    // request again, employer approves early
    await h.send('POST', '/me/address/paste', emp, { address: B });
    const ap = await h.send('POST', '/clients/client-studio/people/p1/address/approve', prep);
    expect(ap.body.wallet.address).toBe(getAddress(B));
    expect(ap.body.wallet.tested).toBe(false);
    expect(ap.body.history[0].action).toMatch(/approved change early|Screening/);
    // request a third, let the hold lapse
    const C = '0x9E8d7C6b5A4f3E2d1C0b9A8f7E6d5C4b3A2f1E0e';
    await h.send('POST', '/me/address/paste', emp, { address: C });
    h.clock.now = new Date(h.clock.now.getTime() + 47 * 3600_000);
    expect((await h.get('/me', emp)).body.wallet.address).toBe(getAddress(B));
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 3600_000);
    const me = (await h.get('/me', emp)).body;
    expect(me.wallet.address).toBe(getAddress(C));
    expect(me.wallet.pending).toBeNull();
  });
  it('lock blocks changes by both sides and cancels a pending change; unlock restores', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const emp = await h.as('u-sample-studio-nurul-huda'); // p3, employer-entered address
    await h.send('POST', '/me/address/paste', emp, { address: '0x1111111111111111111111111111111111111111' });
    const lock = await h.send('POST', '/clients/client-studio/people/p3/address/lock', prep, { locked: true });
    expect(lock.body.wallet.locked).toBe(true);
    expect(lock.body.wallet.pending).toBeNull();
    expect((await h.send('PUT', '/clients/client-studio/people/p3/address', prep, { address: '0x2222222222222222222222222222222222222222' })).status).toBe(409);
    expect((await h.send('POST', '/me/address/paste', emp, { address: '0x2222222222222222222222222222222222222222' })).status).toBe(409);
    await h.send('POST', '/clients/client-studio/people/p3/address/lock', prep, { locked: false });
    const set = await h.send('PUT', '/clients/client-studio/people/p3/address', prep, { address: '0x2222222222222222222222222222222222222222' });
    expect(set.status).toBe(200);
    expect(set.body.wallet.source).toBe('employer');
    expect(set.body.wallet.tested).toBe(false);
  });
  it('a flagged address is recorded by screening but does not block', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const r = await h.send('PUT', '/clients/client-studio/people/p4/address', prep, { address: '0xdead00000000000000000000000000000000beef' });
    expect(r.status).toBe(409); // p4 is locked in the sample
    await h.send('POST', '/clients/client-studio/people/p4/address/lock', prep, { locked: false });
    const r2 = await h.send('PUT', '/clients/client-studio/people/p4/address', prep, { address: '0xdead00000000000000000000000000000000beef' });
    expect(r2.body.wallet.screening).toBe('flagged');
    const run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    const leg = run.lines.find((l: { personId: string }) => l.personId === 'p4').legs[0];
    expect(leg.flagged).toBe(true);
    expect(leg.issue).toBeNull();
  });
  it('invite link accept creates the employee session', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const p = await h.send('POST', '/clients/client-studio/people', prep, { name: 'New Hire', type: 'Contractor', monthlyPay: '1000', currency: 'USD' });
    expect(p.status).toBe(201);
    const inv = await h.send('POST', `/clients/client-studio/people/${p.body.id}/invite`, prep);
    const tok = inv.body.url.split('/invite/')[1];
    expect((await h.get(`/invite/${tok}`, '')).body.personName).toBe('New Hire');
    const r = await h.app.inject({ method: 'POST', url: `/v1/invite/${tok}/accept`, payload: { email: 'new.hire@example.com' } });
    expect(r.statusCode).toBe(200);
    const cookie = `sp_session=${r.cookies.find((c) => c.name === 'sp_session')!.value}`;
    expect((await h.get('/me', cookie)).body.name).toBe('New Hire');
  });
});
