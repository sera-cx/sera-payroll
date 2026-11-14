import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import * as S from './state';

type Params = Record<string, string | readonly string[] | undefined>;
const p = (params: Params, k: string) => String(params[k] ?? '');

function wrap(fn: (ctx: { params: Params; body: () => Promise<Record<string, unknown>>; url: URL }) => unknown | Promise<unknown>, opts: { text?: string } = {}): HttpResponseResolver {
  return async ({ request, params }) => {
    try {
      const r = await fn({ params, body: () => request.json().catch(() => ({})) as Promise<Record<string, unknown>>, url: new URL(request.url) });
      if (r === undefined) return new HttpResponse(null, { status: 204 });
      if (opts.text) return new HttpResponse(String(r), { headers: { 'Content-Type': opts.text } });
      return HttpResponse.json(r as Record<string, unknown>);
    } catch (e) {
      if (e instanceof S.MockError) return HttpResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
      return HttpResponse.json({ error: { code: 'mock_error', message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
    }
  };
}

const v = (path: string) => `/v1${path}`;
export const handlers = [
  http.get(v('/auth/me'), wrap(() => S.me())),
  http.get(v('/auth/demo/users'), wrap(() => S.demoUsers())),
  http.post(v('/auth/demo'), wrap(async ({ body }) => { S.login(String((await body()).userId)); })),
  http.post(v('/auth/logout'), wrap(() => { S.logout(); })),
  http.post(v('/auth/magic-link'), wrap(() => undefined)),

  http.get(v('/clients/:c'), wrap(({ params }) => S.clientView(p(params, 'c')))),
  http.patch(v('/clients/:c/settings'), wrap(async ({ params, body }) => S.patchSettings(p(params, 'c'), await body()))),
  http.get(v('/clients/:c/people'), wrap(({ params, url }) => S.people(p(params, 'c'), url.searchParams.get('q') ?? ''))),
  http.post(v('/clients/:c/people'), wrap(async ({ params, body }) => S.addPerson(p(params, 'c'), (await body()) as never))),
  http.post(v('/clients/:c/people/import'), wrap(async ({ params, body }) => S.importPeople(p(params, 'c'), String((await body()).text)))),
  http.patch(v('/clients/:c/people/:id'), wrap(async ({ params, body }) => S.editPerson(p(params, 'c'), p(params, 'id'), await body()))),
  http.delete(v('/clients/:c/people/:id'), wrap(({ params }) => { S.removePerson(p(params, 'c'), p(params, 'id')); })),
  http.post(v('/clients/:c/people/:id/invite'), wrap(({ params }) => S.invite(p(params, 'c'), p(params, 'id')))),
  http.put(v('/clients/:c/people/:id/address'), wrap(async ({ params, body }) => S.setAddress(p(params, 'c'), p(params, 'id'), String((await body()).address)))),
  http.post(v('/clients/:c/people/:id/address/lock'), wrap(async ({ params, body }) => S.lock(p(params, 'c'), p(params, 'id'), !!(await body()).locked))),
  http.post(v('/clients/:c/people/:id/address/approve'), wrap(({ params }) => S.approveP(p(params, 'c'), p(params, 'id')))),
  http.post(v('/clients/:c/people/:id/address/reject'), wrap(({ params }) => S.rejectP(p(params, 'c'), p(params, 'id')))),
  http.post(v('/clients/:c/people/:id/address/test-payment'), wrap(({ params }) => S.testPay(p(params, 'c'), p(params, 'id')))),

  http.get(v('/clients/:c/runs/current'), wrap(({ params }) => S.runView(p(params, 'c')))),
  http.patch(v('/clients/:c/runs/current'), wrap(async ({ params, body }) => S.patchRun(p(params, 'c'), await body()))),
  http.post(v('/clients/:c/runs/current/one-offs'), wrap(async ({ params, body }) => S.addOneOff(p(params, 'c'), (await body()) as never))),
  http.delete(v('/clients/:c/runs/current/one-offs/:x'), wrap(({ params }) => S.removeOneOff(p(params, 'c'), p(params, 'x')))),
  http.post(v('/clients/:c/runs/current/skip'), wrap(async ({ params, body }) => { const b = await body(); return S.skip(p(params, 'c'), String(b.personId), !!b.skipped); })),
  http.post(v('/clients/:c/runs/current/funding/instructions'), wrap(({ params }) => S.runView(p(params, 'c')).totals.funding.kind === 'bank' ? (S.runView(p(params, 'c')).totals.funding as { deposit: unknown }).deposit : null)),
  http.post(v('/clients/:c/runs/current/funding/confirm'), wrap(({ params }) => S.confirmFunds(p(params, 'c')))),
  http.post(v('/clients/:c/runs/current/topup'), wrap(({ params }) => S.topup(p(params, 'c')))),
  http.post(v('/clients/:c/runs/current/next'), wrap(({ params }) => S.nextRun(p(params, 'c')))),
  http.post(v('/clients/:c/runs/:r/submit'), wrap(({ params }) => S.submit(p(params, 'c')))),
  http.post(v('/clients/:c/runs/:r/unsubmit'), wrap(({ params }) => S.unsubmit(p(params, 'c')))),
  http.post(v('/clients/:c/runs/:r/approve'), wrap(async ({ params, body }) => S.approve(p(params, 'c'), (await body()) as never))),
  http.post(v('/clients/:c/runs/:r/multisig/sign'), wrap(async ({ params, body }) => S.multisigSign(p(params, 'c'), String((await body()).signerAddress)))),
  http.get(v('/clients/:c/runs'), wrap(({ params }) => S.runs(p(params, 'c')))),
  http.get(v('/clients/:c/runs/:r'), wrap(({ params }) => S.runRecord(p(params, 'c'), p(params, 'r')))),
  http.get(v('/clients/:c/runs/:r/export'), wrap(({ params }) => S.exportCsv(p(params, 'c'), p(params, 'r')), { text: 'text/csv' })),
  http.get(v('/clients/:c/runs/:r/payslips/:pid.pdf'), wrap(() => 'PDF payslips come from the API server, not the mock.', { text: 'text/plain' })),
  http.post(v('/clients/:c/payouts/:id/retry'), wrap(({ params }) => S.retry(p(params, 'c'), p(params, 'id')))),
  http.get(v('/clients/:c/outbox'), wrap(({ params }) => S.outbox(p(params, 'c')))),

  http.get(v('/me'), wrap(() => S.meView())),
  http.patch(v('/me/payout'), wrap(async ({ body }) => S.setPayout(await body()))),
  http.get(v('/me/address/challenge'), wrap(({ url }) => S.challenge(url.searchParams.get('address') ?? ''))),
  http.post(v('/me/address/sign'), wrap(async ({ body }) => S.signAddress((await body()) as never))),
  http.post(v('/me/address/paste'), wrap(async ({ body }) => S.pasteAddress(String((await body()).address)))),
  http.post(v('/me/address/cancel'), wrap(() => S.cancelMine())),
  http.post(v('/me/verification/start'), wrap(() => S.startKyc())),
  http.get(v('/me/payslips'), wrap(() => S.myPayslips())),
  http.get(v('/me/payslips/:r/disclose'), wrap(({ params, url }) => S.disclose(p(params, 'r'), (url.searchParams.get('fields') ?? '').split(',').filter(Boolean)))),
  http.get(v('/me/payslips/:r.pdf'), wrap(() => 'PDF payslips come from the API server, not the mock.', { text: 'text/plain' })),
  http.get(v('/invite/:t'), wrap(({ params }) => S.inviteInfo(p(params, 't')))),
  http.post(v('/invite/:t/accept'), wrap(async ({ params, body }) => { S.acceptInvite(p(params, 't'), String((await body()).email)); })),

  http.get(v('/operator'), wrap(() => S.operator())),
  http.post(v('/operator/clients'), wrap(async ({ body }) => S.addClient((await body()) as never))),
  http.patch(v('/operator/clients/:c'), wrap(async ({ params, body }) => S.editClient(p(params, 'c'), await body()))),
  http.get(v('/operator/ramps'), wrap(() => S.rampsView())),
  http.patch(v('/operator/ramps/:ccy'), wrap(async ({ params, body }) => S.setRamp(p(params, 'ccy'), await body()))),
  http.get(v('/operator/plugins'), wrap(() => S.pluginsView())),
  http.patch(v('/operator/plugins/:ccy'), wrap(async ({ params, body }) => S.setPlugin(p(params, 'ccy'), !!(await body()).enabled))),
  http.get(v('/operator/api-keys'), wrap(() => S.apiKeysView())),
  http.post(v('/operator/api-keys'), wrap(async ({ body }) => S.addApiKey(String((await body()).label)))),
  http.delete(v('/operator/api-keys/:id'), wrap(({ params }) => { S.delApiKey(p(params, 'id')); })),
  http.get(v('/operator/webhooks'), wrap(() => S.webhooksView())),
  http.post(v('/operator/webhooks'), wrap(async ({ body }) => S.addWebhook((await body()) as never))),
  http.delete(v('/operator/webhooks/:id'), wrap(({ params }) => { S.delWebhook(p(params, 'id')); })),
  http.get(v('/operator/webhooks/:id/deliveries'), wrap(() => S.deliveries())),
  http.post(v('/operator/demo/reset'), wrap(() => { S.reset(); })),
];
