import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lines, sampleContext, totals, verifyProof } from '@sera-payroll/core';
import { approverAccount, harness, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await harness(); });
afterAll(async () => { await h.close(); });

describe('pay run flow', () => {
  it('draft → submit → approve with a real EIP-712 signature → worker completes; totals match core; payslips sealed', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const appr = await h.as('u-sample-studio-approver');
    let run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    // Totals match the core engine for the same sample inputs
    const ctx = sampleContext(0);
    const t = totals(ctx, lines(ctx));
    expect(run.totals.need).toBe(t.need.toFixed(2));
    expect(run.totals.count).toBe(t.count);
    expect(run.totals.swaps).toBe(t.swaps);
    expect(run.totals.issues).toBe(1);
    expect(run.totals.canSend).toBe(false);
    await h.send('POST', '/clients/client-studio/runs/current/skip', prep, { personId: 'p5', skipped: true });
    await h.send('POST', '/clients/client-studio/runs/current/one-offs', prep, { personId: 'p4', amount: '250', currency: 'USD', kind: 'Reimbursement' });
    run = (await h.send('POST', '/clients/client-studio/runs/current/topup', prep)).body;
    expect(run.totals.ready).toBe(true);
    expect(run.totals.canSend).toBe(true);
    expect(run.lines.some((l: { kind: string }) => l.kind === 'Reimbursement')).toBe(true);
    // Approve before submit is a bad transition under two-person approval
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature: 'demo' }, { 'idempotency-key': 'early' })).status).toBe(409);
    run = (await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, prep)).body;
    expect(run.status).toBe('submitted');
    expect(run.approval.primaryType).toBe('PayRunApproval');
    // Sign the typed data with the registered demo signer
    const m = run.approval.message;
    const signature = await approverAccount.signTypedData({ domain: run.approval.domain, types: run.approval.types, primaryType: 'PayRunApproval', message: { ...m, totalMinor: BigInt(m.totalMinor), ratesLockedAt: BigInt(m.ratesLockedAt) } });
    // A wrong signer address is refused
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature, signerAddress: '0x1111111111111111111111111111111111111111' }, { 'idempotency-key': 'k0' })).status).toBe(403);
    // Missing idempotency key is refused
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature, signerAddress: approverAccount.address })).status).toBe(400);
    const balanceBefore = Number((await h.get('/clients/client-studio', appr)).body.balances.USDT);
    const ok = await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature, signerAddress: approverAccount.address }, { 'idempotency-key': 'k1' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('sent');
    expect(ok.body.signedWith).toContain(approverAccount.address);
    expect(ok.body.items.flatMap((i: { payouts: unknown[] }) => i.payouts)).toHaveLength(6);
    // Replay returns the same record and does not re-run
    const again = await h.send('POST', `/clients/client-studio/runs/${run.id}/approve`, appr, { signature: 'demo' }, { 'idempotency-key': 'k1' });
    expect(again.body.id).toBe(ok.body.id);
    expect((await h.get('/clients/client-studio/runs', appr)).body.filter((r: { id: string }) => r.id === run.id)).toHaveLength(1);
    // Demo balance was debited once
    const client = (await h.get('/clients/client-studio', appr)).body;
    expect(Number(client.balances.USDT)).toBeCloseTo(balanceBefore - Number(ok.body.need), 2);
    // Worker drains to complete
    await h.worker.drain();
    const rec = (await h.get(`/clients/client-studio/runs/${run.id}`, appr)).body;
    expect(rec.status).toBe('complete');
    for (const p of rec.items.flatMap((i: { payouts: { state: string; txHash: string | null; stageIndex: number; stages: string[] }[] }) => i.payouts)) {
      expect(p.state).toBe('done');
      expect(p.txHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(p.stageIndex).toBe(p.stages.length - 1);
    }
    // Payslips sealed and anchored
    for (const i of rec.items) { expect(i.payslip.root).toMatch(/^0x/); expect(i.payslip.anchorTx).toMatch(/^0x/); }
    const slip = (await h.get(`/clients/client-studio/runs/${run.id}/payslips/p1`, appr)).body;
    expect(slip.document.net).toBe('8500.00');
    const d = (await h.get(`/clients/client-studio/runs/${run.id}/payslips/p1?fields=net,payday`, appr)).body;
    expect(d.fields).toHaveLength(2);
    for (const f of d.fields) expect(verifyProof(d.root, f.leaf, f.proof)).toBe(true);
    // Employee sees it and can disclose
    const emp = await h.as('u-sample-studio-aisyah-rahman');
    const mine = (await h.get('/me/payslips', emp)).body;
    expect(mine[0].label).toBe('November 2026');
    expect(mine[0].payslip.root).toBe(slip.root);
    const disc = (await h.get(`/me/payslips/${run.id}/disclose?fields=net`, emp)).body;
    expect(verifyProof(disc.root, disc.fields[0].leaf, disc.fields[0].proof)).toBe(true);
    // PDF
    const pdf = await h.app.inject({ method: 'GET', url: `/v1/me/payslips/${run.id}.pdf`, headers: { cookie: emp } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.length).toBeGreaterThan(1000);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    // Export
    const csv = await h.get(`/clients/client-studio/runs/${run.id}/export`, appr);
    expect(csv.body.split('\n')[0]).toMatch(/^run,pay date,name/);
    expect(csv.body.split('\n')).toHaveLength(7);
    // The sent run stays current until the next one is drafted; then December
    expect((await h.get('/clients/client-studio/runs/current', prep)).body.id).toBe(run.id);
    const next = (await h.send('POST', '/clients/client-studio/runs/current/next', prep)).body;
    expect(next.idx).toBe(1);
    expect(next.label).toBe('December 2026');
    expect(next.status).toBe('draft');
    // Webhooks and outbox saw the run
    const out = (await h.get('/clients/client-studio/outbox', appr)).body;
    expect(out.filter((m: { kind: string }) => m.kind === 'paid')).toHaveLength(5); // four salaries and one reimbursement, one email per item as in the prototype
  });

  it('a submitted run can go back to draft; a sent run cannot be edited; schedule only changes on a draft', async () => {
    const prep = await h.as('u-sample-studio-preparer');
    const run = (await h.get('/clients/client-studio/runs/current', prep)).body;
    await h.send('POST', '/clients/client-studio/runs/current/skip', prep, { personId: 'p5', skipped: true });
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/submit`, prep)).body.status).toBe('submitted');
    expect((await h.send('PATCH', '/clients/client-studio/runs/current', prep, { fundingSource: 'USDC' })).status).toBe(409);
    expect((await h.send('PATCH', '/clients/client-studio/settings', prep, { schedule: 'Weekly on Friday' })).status).toBe(409);
    expect((await h.send('POST', `/clients/client-studio/runs/${run.id}/unsubmit`, prep)).body.status).toBe('draft');
    const w = await h.send('PATCH', '/clients/client-studio/settings', prep, { schedule: 'Weekly on Friday' });
    expect(w.status).toBe(200);
    const v = (await h.get('/clients/client-studio/runs/current', prep)).body;
    expect(v.label).toMatch(/^Week to/);
    expect(v.lines[0].gross).toBe((8500 * 12 / 52).toFixed(2));
    await h.send('PATCH', '/clients/client-studio/settings', prep, { schedule: 'Monthly on the 28th' });
  });

  it('single-admin client: draft → approve directly, bank funding needs confirmed funds, held payout does not block', async () => {
    const op = await h.as('u-operator');
    // client-exports: twoPerson off, Farah bank:MYR verified, Hiroshi JPYC wallet
    let run = (await h.get('/clients/client-exports/runs/current', op)).body;
    expect(run.approval).toBeTruthy();
    await h.send('PATCH', '/clients/client-exports/runs/current', op, { fundingSource: 'bank:MYR' });
    run = (await h.get('/clients/client-exports/runs/current', op)).body;
    expect(run.totals.funding.kind).toBe('bank');
    expect(run.totals.canSend).toBe(false);
    expect((await h.send('POST', `/clients/client-exports/runs/${run.id}/approve`, op, { signature: 'demo' }, { 'idempotency-key': 'b0' })).body.error.code).toBe('funding');
    const ins = await h.send('POST', '/clients/client-exports/runs/current/funding/instructions', op);
    expect(ins.body.reference).toMatch(/^PAYRUN-/);
    run = (await h.send('POST', '/clients/client-exports/runs/current/funding/confirm', op, { reference: ins.body.reference })).body;
    expect(run.totals.canSend).toBe(true);
    // Flag Hiroshi's address so his payout is held
    await h.send('PUT', '/clients/client-exports/people/p202/address', op, { address: '0xbad0000000000000000000000000000000000001' });
    run = (await h.get('/clients/client-exports/runs/current', op)).body;
    expect(run.totals.held).toBe(1);
    expect(run.totals.ready).toBe(true);
    const sent = await h.send('POST', `/clients/client-exports/runs/${run.id}/approve`, op, { signature: 'demo' }, { 'idempotency-key': 'b1' });
    expect(sent.status).toBe(200);
    await h.worker.drain();
    const rec = (await h.get(`/clients/client-exports/runs/${run.id}`, op)).body;
    expect(rec.status).toBe('complete');
    expect(rec.statusText).toBe('Complete, 1 held');
    const states = rec.items.flatMap((i: { payouts: { option: string; state: string }[] }) => i.payouts).map((p: { option: string; state: string }) => [p.option, p.state]);
    expect(states).toEqual(expect.arrayContaining([['bank:MYR', 'done'], ['JPYC', 'held']]));
  });

  it('multisig needs two signatures', async () => {
    const op = await h.as('u-operator');
    await h.send('PATCH', '/clients/client-labs/settings', op, { multisig: true });
    const run = (await h.get('/clients/client-labs/runs/current', op)).body;
    expect(run.multisig.threshold).toBe(2);
    await h.send('POST', '/clients/client-labs/runs/current/topup', op);
    const m = run.approval.message;
    const sig = await approverAccount.signTypedData({ domain: run.approval.domain, types: run.approval.types, primaryType: 'PayRunApproval', message: { ...m, totalMinor: BigInt(m.totalMinor), ratesLockedAt: BigInt(m.ratesLockedAt) } });
    const one = await h.send('POST', `/clients/client-labs/runs/${run.id}/approve`, op, { signature: sig, signerAddress: approverAccount.address }, { 'idempotency-key': 'm1' });
    expect(one.status).toBe(409);
    expect(one.body.error.code).toBe('more_signatures');
    await h.send('PATCH', '/clients/client-labs/settings', op, { multisig: false });
  });
});
