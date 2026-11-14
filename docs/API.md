# HTTP API contract

Base path `/v1`. JSON in and out. All amounts are decimal strings. All ids are strings (UUIDs). Dates are ISO 8601.
Errors: `{ "error": { "code": "snake_case", "message": "Plain English" } }` with 400/401/403/404/409/422.

## Auth and tenancy

- Session cookie `sp_session` (httpOnly, SameSite=Lax), set by the auth routes below. The web app sends `credentials: 'include'`.
- API keys (operator integrations): header `Authorization: Bearer <api_key>`. Keys are scoped to an operator and may act on any of its clients.
- Every employer route is scoped by `clientId` in the path. The server checks the user belongs to that client (or is an operator admin of its operator). Every query is scoped by client.
- Roles: `operator_admin`, `preparer`, `approver`, `employee`. A user row has one role. In demo mode the sample data gives one user per role per client.
- Two-person approval is enforced server-side: when `settings.twoPerson` is on, `approve` rejects the user who prepared the run (`same_person`).

```
POST /auth/demo            { userId }                      demo mode only (DEMO_MODE=true). Sets the session. 404 otherwise.
GET  /auth/demo/users                                      demo mode only: [{ id, name, email, role, clientId, operatorId, personId }]
POST /auth/magic-link      { email }                       sends a sign-in link through the Notifier. Always 204.
GET  /auth/callback?token=                                 sets the session, redirects to WEB_ORIGIN.
GET  /auth/siwe/nonce                                      { nonce }
POST /auth/siwe            { message, signature }          sign-in with Ethereum for approvers whose wallet is registered. Sets session.
GET  /auth/me                                              { user: { id, name, email, role, clientId, operatorId, personId }, demoMode, network: { name, chainId, explorer } }
POST /auth/logout                                          204
```

## Shapes

```ts
Person {
  id, name, type: 'Employee'|'Contractor', monthlyPay, currency: Fiat,
  payoutPrimary: PayoutOption, payoutSecondary: PayoutOption|null, splitPercent: number,
  kycVerified: boolean, kycStatus: 'not_started'|'pending'|'verified'|'rejected', setupDone: boolean, email: string|null,
  wallet: { address, network, source, locked, tested, screening: 'unscreened'|'clear'|'flagged', screeningReason, pending: { address, source, requestedAt, liveAt }|null },
  history: AddressEvent[]   // newest first: { at, actor, action, oldAddress, newAddress }
}
Settings { twoPerson, multisig, schedule, gasPayer, requireTestPayment, feePercent (read-only for employer), addressHoldHours (read-only for employer), treasuryWallet: Address|null, brand }
Ramps  { [Fiat]: { onRamp, offRamp, partner: string } }
Plugins { [Fiat]: boolean }

RunView {            // the computed draft, straight from @sera-payroll/core lines()+totals()
  id, idx, status: 'draft'|'submitted'|'sent'|'complete', label, payday, schedule, per,
  fundingSource: PayoutOption, fundingOptions: { option, enabled, reason? }[], funded,
  preparedBy: { id, name }|null, approvedBy: { id, name }|null, sentAt,
  lines: [{ personId, name, type, kind, currency, gross, deduction, net, skipped, oneOffId,
            legs: [{ option, sharePercent, amount, issue, flagged, rateLine, path: [{label, sera?}] }] }],
  totals: { fundingCurrency, fundingAsset, payouts, count, swaps, toBank, toWallet, issues, held, fee, feePercent, gas, need,
            funding: {kind:'wallet', balance, shortBy, ok} | {kind:'bank', rampOk, funded, ok, deposit?: { reference, beneficiary, accountDetails, amount, currency }},
            ready, canSend },
  rates: { [Fiat]: string }, ratesAsOf, rateSource: 'sample'|'sera.cx',
  approval?: { domain, types, primaryType, message }     // EIP-712 PayRunApproval typed data, present when status is submitted (or draft with twoPerson off)
}
RunRecord {          // immutable once sent
  id, label, payday, fundingSource, need, fee, gas, count, swaps, held, status, sentAt, by, signedWith,
  items: [{ personId, name, type, kind, currency, gross, deduction, net,
            payouts: [{ id, option, sharePercent, amount, amountText, sub, lockedRate, usdValue, needsSwap, stages, stageIndex, state, txHash, explorerUrl, failureReason, addressSnapshot, networkSnapshot, path }],
            payslip: { id, root, docHash, anchorTx, anchorId, employerSignature }|null }]
}
```

## Employer (preparer, approver)

```
GET  /clients/:clientId                                     { id, name, settings: Settings, ramps, plugins, balances: {[coin]: string}, operator: { name, brand } }
PATCH /clients/:clientId/settings                           partial Settings (not feePercent/addressHoldHours)  → Settings. Schedule only while the current run is a draft (409 run_not_draft).

GET  /clients/:clientId/people?q=                           Person[]
POST /clients/:clientId/people                              { name, type, monthlyPay, currency, email? } → Person
PATCH /clients/:clientId/people/:id                         { name?, type?, monthlyPay?, email? } → Person
DELETE /clients/:clientId/people/:id                        204 (also removes their one-offs from the draft)
POST /clients/:clientId/people/import                       { text } → { imported: number, rejected: [{line, reason}], message, people: Person[] }
POST /clients/:clientId/people/:id/invite                   → { url, expiresAt } and sends 'invite' through the Notifier
PUT  /clients/:clientId/people/:id/address                  { address } employer entry. 409 locked. Screens the address. → Person
POST /clients/:clientId/people/:id/address/lock             { locked: boolean } → Person
POST /clients/:clientId/people/:id/address/approve          approve pending early → Person
POST /clients/:clientId/people/:id/address/reject           → Person
POST /clients/:clientId/people/:id/address/test-payment     sends/marks a test payment (demo: marks). → Person

GET  /clients/:clientId/runs/current                        RunView (creates the draft if none)
PATCH /clients/:clientId/runs/current                       { fundingSource?, funded? } → RunView. 409 run_not_draft.
POST /clients/:clientId/runs/current/one-offs               { personId, amount, currency, kind } → RunView
DELETE /clients/:clientId/runs/current/one-offs/:oneOffId   → RunView
POST /clients/:clientId/runs/current/skip                   { personId, skipped: boolean } → RunView
POST /clients/:clientId/runs/current/funding/instructions   bank funding: → deposit instructions from the on-ramp RampAdapter
POST /clients/:clientId/runs/current/funding/confirm        bank funding: { reference } asks the adapter; demo adapter confirms. → RunView
POST /clients/:clientId/runs/current/topup                  demo only: credits the demo balance → RunView
POST /clients/:clientId/runs/:runId/submit                  preparer. 409 not_ready. → RunView (status submitted), notifies approvers.
POST /clients/:clientId/runs/:runId/unsubmit                → RunView (status draft)
POST /clients/:clientId/runs/:runId/approve                 approver. { signature, signerAddress, simulateFailure?: boolean (demo) }
                                                            Verifies the EIP-712 PayRunApproval signature against the client's treasury wallet (or any registered signer),
                                                            re-checks totals and funding, snapshots the record, debits demo balance, starts the payout worker.
                                                            Header Idempotency-Key required. → RunRecord
POST /clients/:clientId/runs/:runId/multisig/sign           { signature, signerAddress } collects one signature when settings.multisig; approve succeeds once threshold met.
GET  /clients/:clientId/runs                                RunRecord[] newest first (sent and complete only)
GET  /clients/:clientId/runs/:runId                         RunRecord
GET  /clients/:clientId/runs/:runId/payouts                 RunRecord.items[].payouts flattened
GET  /clients/:clientId/runs/:runId/export                  text/csv accounting export
POST /clients/:clientId/payouts/:payoutId/retry             Header Idempotency-Key required. Only state failed. → payout
GET  /clients/:clientId/runs/:runId/payslips/:personId.pdf  application/pdf
GET  /clients/:clientId/runs/:runId/payslips/:personId      { document, leaves, root, docHash, anchorTx, employerSignature }   (the sealed payslip)

GET  /clients/:clientId/outbox                              [{ id, at, to, subject, kind }]
GET  /clients/:clientId/audit?limit=                        [{ at, actor, action, subject, detail }]
```

## Employee (role employee; `me` resolves to the session's person)

```
GET  /me                                                    Person + { client: { name, brand }, ramps, rates, payoutOptions: [{ option, enabled, reason?, estimate }] }
PATCH /me/payout                                            { payoutPrimary?, payoutSecondary?: PayoutOption|null, splitPercent? } → Person
GET  /me/address/challenge?address=                         { message, nonce } the text to sign (addressProofMessage)
POST /me/address/sign                                       { address, signature, nonce } server verifies → Person (first address live; change starts hold)
POST /me/address/paste                                      { address } → Person (same hold rules, source employee_pasted)
POST /me/address/cancel                                     cancels pending → Person
POST /me/verification/start                                 → { url } hosted KYC at the off-ramp partner (demo adapter: verifies at once)
GET  /me/verification                                       { status }
GET  /me/payslips                                           [{ runId, label, payday, kind, net, currency, payouts: [...], payslip: {root, anchorTx, explorerUrl}|null }]
GET  /me/payslips/:runId.pdf
GET  /me/payslips/:runId/disclose?fields=net,payday         { root, anchorTx, fields: [{ leaf, proof }] } selective disclosure bundle
GET  /invite/:token                                         public: { personName, clientName, brand } ; POST /invite/:token/accept { email } → session as that employee
```

## Operator (role operator_admin)

```
GET  /operator                                              { id, name, brand, settings: { addressHoldHours, demoMode }, clients: [{ id, name, feePercent, peopleCount, treasuryWallet }] }
POST /operator/clients                                      { name, feePercent } → client
PATCH /operator/clients/:clientId                           { name?, feePercent?, treasuryWallet? } → client
GET  /operator/ramps                                        Ramps with adapter names
PATCH /operator/ramps/:currency                             { onRamp?, offRamp? } → Ramps
GET  /operator/plugins                                      [{ currency, country, enabled, plugin }]
PATCH /operator/plugins/:currency                           { enabled } → plugins
GET  /operator/api-keys  POST /operator/api-keys { label }  → { id, label, key (once), createdAt }   DELETE /operator/api-keys/:id
GET  /operator/webhooks  POST /operator/webhooks { url, events[] } → { id, url, events, secret (once) }  DELETE /operator/webhooks/:id
GET  /operator/webhooks/:id/deliveries                      [{ at, event, status, responseCode }]
POST /operator/demo/reset                                   demo mode: reseed sample data. 204
```

Webhook delivery: `POST url` with JSON `{ id, event, at, data }` and header `X-Sera-Payroll-Signature: sha256=<hmac(secret, body)>`. Retry 3 times with backoff. Events: see `WEBHOOK_EVENTS` in core.

## Public API for integrations (API key)

The sketch in build notes section 9 maps to the routes above:
```
POST /v1/employees/import   → POST /clients/:clientId/people/import
POST /v1/runs               → GET  /clients/:clientId/runs/current (draft is created on demand)
POST /v1/runs/{id}/submit   → POST /clients/:clientId/runs/:runId/submit
POST /v1/runs/{id}/approve  → POST /clients/:clientId/runs/:runId/approve
GET  /v1/runs/{id}/payouts  → GET  /clients/:clientId/runs/:runId/payouts
POST /v1/payouts/{id}/retry → POST /clients/:clientId/payouts/:payoutId/retry
GET  /v1/runs/{id}/export   → GET  /clients/:clientId/runs/:runId/export
```

## Payout worker

After approve, one job per payout, in order: screen (ScreeningProvider; flagged → state held, event payout.held) → swap on Sera.cx when needsSwap (SwapProvider.settle, store txHash, event payout.swapped) → send to wallet (ChainAdapter.disburse batched per run, event payout.sent) or send to off-ramp partner (RampAdapter.createBankPayout, then poll getPayoutStatus → arrived). Any error → failed with reason; retry restarts from the first incomplete stage using the same idempotency key per payoutId so nothing pays twice. In demo mode the mock adapters advance each stage roughly every second so the UI shows movement, and `simulateFailure` fails the first payout once.

When a payout reaches its final stage the item's payslip is sealed (core `sealPayslip`), signed by the server's operator key (EIP-712 `Payslip`), anchored through `ChainAdapter.anchorPayslip`, and `payslip.anchored` is emitted.
