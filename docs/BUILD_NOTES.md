# Build notes

This is the original brief, ported from the `build-notes` section of the single-file prototype in [prototype/sera-payroll-prototype.html](prototype/sera-payroll-prototype.html). It holds every decision, the rules, the data model, the interfaces and the build order. Sections 1 to 17 are the brief as written, with the status of each build step added to section 15. Section 18 was added during the build and records the Sera.cx interface as found in the published docs and code.

The prototype's script is the reference for behaviour. Section 16 maps each of its functions to a feature; the same names reappear in `packages/core`.

## 1. What we are building

- An open-source stablecoin payroll platform, built by Sera.cx and released for others to fork, in the same way as the Sera.cx open-source payment gateway.
- Employers fund a pay run in any supported stablecoin or in fiat. Each employee chooses what they receive: any supported stablecoin to their wallet, or fiat to their bank. The two choices are independent.
- Sera.cx is the stablecoin-to-stablecoin swap in the middle. On-ramp and off-ramp partners handle fiat in and fiat out.
- Sera.cx does not run payroll for anyone. Payroll companies and other operators fork this and run it under their own brand and licence.
- The differentiator is non-USD stablecoins (MYRT, XSGD, IDRT, JPYC and others). Existing stablecoin payroll products pay out in USDT or USDC. Here an employee in Malaysia can receive MYRT, or ringgit by DuitNow, while the employer funds in USDT.
- First deliverable is a public demo site that developers can try, clearly labelled as a demo, plus the repo they fork.

## 2. Who uses it

- **Payroll and EOR companies (operators):** the main audience. They fork it and add it as a payout rail for their existing clients.
- **Crypto-native companies:** treasury already in stablecoins, often a multisig. May self-host.
- **Remote-first companies with overseas contractors**, agencies, outsourcers and gig platforms: many small cross-border payouts.
- **Businesses that earn in stablecoins** and want to pay people without converting to fiat first.
- Not the target: a local business paying local staff in local currency by bank transfer.

## 3. Roles and views

| Role | What they do |
|---|---|
| Operator admin | Manages employer clients and each client's fee, connects ramp partners per currency, turns statutory plug-ins on, holds API keys and webhooks. |
| Preparer (employer) | Maintains the roster, imports pay files, builds the pay run, submits it for approval. |
| Approver (employer) | Reviews, signs with the treasury wallet and sends. Cannot approve a run they prepared when two-person approval is on. |
| Employee or contractor | Chooses payout currency and split, adds or signs a wallet address, verifies with the off-ramp partner for bank payouts, reads payslips. |

## 4. Decisions already made

- **Wallet address, either route is valid:** the employer can enter an employee's address, or the employee can sign with their own wallet. Neither is required over the other. An employer-entered address is good for payout without employee confirmation.
- **Lock:** the employer can lock an address. While locked, nobody can change it until an employer admin unlocks it.
- **Hold on changes:** an employee changing an existing address starts a 48 hour hold. The employer can approve it early or reject it. The employee can cancel it. A first-time address has no hold. The hold length should be configurable by the operator.
- **Snapshot at signing:** addresses and rates freeze for a run when it is signed. Later edits apply to the next run.
- **Database and email are allowed.** An earlier idea of no database was dropped. Forks add their own database and email provider.
- **Non-custodial:** funds go from the employer's wallet, through the swap, to the employee or the off-ramp partner. The operator and Sera.cx never hold funds or keys.
- **Bank details never touch this app.** For fiat payouts the employee is verified by the off-ramp partner, who holds their bank details. The app stores only the partner's reference or deposit address for that employee.
- **Screening:** every address is screened when added and again before each payout. A flagged address holds that one payout. The rest of the run goes ahead.
- **"People" means employees and contractors.** The tab is called Employees.
- **Demo labelling:** the public demo carries a permanent banner saying it is a demo, that nothing is real, and that the code is open source.
- **Public demo runs on a testnet** with test stablecoins and a real wallet connection, so developers see a real signature and transaction while no real salary moves.

## 5. What the prototype simulates and what the real build must do

| Area | In the prototype | Real build |
|---|---|---|
| Wallet connect and signing | Buttons only. No wallet opens. Addresses from "sign" are random. | Connect a real wallet. Employee proves an address by signing a message that the server verifies. Approver signs and sends the run from the treasury wallet. Support multisig treasuries. |
| Swap on Sera.cx | Fixed sample rates in `RATE`. No call is made. | Integrate with Sera.cx for rates and settlement. Sera.cx is non-custodial and settles with signed EIP-712 intents. Use the published docs (docs.sera.cx) and the Sera.cx open-source gateway and swap code for the real interfaces. Do not guess them. Ask the Sera.cx team where the docs are unclear. |
| Rate lock | "Lock on approval" is a label. | Fetch rates at review, lock at signing, and define what happens if a rate moves or liquidity for a pair is short before settlement. |
| Payout stages | A timer advances each payout. | Stages come from chain events and ramp partner status callbacks. Store transaction hashes. |
| Failed payout | A checkbox in the sign prompt fails the first payout. | Detect real failures per payout, keep the rest of the run, allow retry of one payout without double paying. Retries must be idempotent. |
| Screening | An address starting `0xdead` or `0xbad` is flagged. | Call a real screening service. Sera.cx publishes open-source KYT and KYA screening tools that can be the default provider. (See section 18: no such public repo was found at build time.) |
| Ramp partners | On and off toggles per currency. Partner names are placeholders. | An adapter interface per partner (see section 9). Ship one mock adapter. Operators write their own. |
| Employee verification | One button marks the employee verified. | Hand off to the off-ramp partner's hosted KYC and read the status back. |
| Funding check | A fake balance per stablecoin in `S.bal`. | Read the treasury wallet balance and token allowance on chain. For bank funding, show the on-ramp partner's real deposit details and wait for their confirmation. |
| Emails | Listed in the Outbox tab. Nothing is sent. | Send through an email provider behind an interface. Keep the outbox as a log. |
| Statutory deductions | A flat 10% sample deduction for employees when a plug-in is on. | Country plug-ins with real rules, maintained by operators. Contractors are paid gross. |
| Payslip and export | Copy to clipboard as text and CSV. | Downloadable PDF payslip and CSV export. Add accounting integrations later. |
| Storage | Everything is in memory in the `S` object and is lost on reload. | A database (see section 8). |
| Sign-in and permissions | A view switch and an "Acting as" dropdown. | Real accounts and role checks on the server for every action. |
| Network | Ethereum is written as a label. | Store the network with every address. Start with Ethereum. Plan for the Sera.cx appchain when it is live. Never assume the network. |
| Fees | 0.5% sample operator fee, US$0.20 sample network fee per payout, "rate against reference 0.00%". | Operator fee from client settings, real gas estimates, real reference rate comparison. |

## 6. Rules and formulas the prototype already implements

- **Pay per run:** monthly pay × schedule fraction. Monthly on the 28th = 1. Twice a month (14th and 28th) = 0.5. Weekly on Friday = 12/52. See `runInfo()`.
- **Net:** gross minus plug-in deduction. Deductions apply to salary lines for employees only, never to contractors or one-off payments. See `lines()`.
- **Payout amount:** net × split share, converted from the salary currency to the payout currency. If employees pay network fees, the fee is deducted here. See `legsFor()`.
- **Employer total:** sum of payouts in the funding currency + operator fee (percentage of payouts) + network fees when the employer pays them. See `totals()`.
- **Swap needed** only when the funding stablecoin differs from the payout stablecoin. A fiat payout settles in that currency's local stablecoin first (for example MYR to bank goes through MYRT). See `pathSteps()` and `dstAsset()`.
- **Blocking issues** stop the whole run until fixed: no wallet address for a stablecoin payout, no off-ramp partner for a bank payout, employee not verified with the off-ramp partner, test payment missing when required.
- **Not blocking:** a screening flag. That payout is held and the run proceeds.
- **Funding check** must pass before signing: wallet balance covers the total, or bank funds are confirmed received.
- **Skip this run** leaves a person out of one run without removing them.
- **One-off payments** (bonus, contractor invoice, reimbursement) are extra lines on a run, in any supported currency, paid by the person's payout preference.
- **Decimals:** IDR and JPY use 0 decimal places, others 2. The real build must use integer or decimal maths, never floating point, and define the rounding rule for conversions. (Defined in `packages/core/src/money.ts`: conversions at full precision, each payout rounded half up to the payout currency's places once, totals rounded to the funding currency's places at the end.)

## 7. State machines

**Pay run:** draft → submitted (only when two-person approval is on) → sent → complete when every payout is in a final state. A submitted run can go back to draft. A sent run cannot be edited.

**Payout:** screened → swapped on Sera.cx (if needed) → sent to wallet, or sent to off-ramp partner → arrived at bank. Side states: failed (can be retried), held (screening flag).

**Wallet address:** none → active, by employer entry or employee signature → pending change (employee-requested, 48 hour hold) → active. Flags: locked, tested. Any address change clears "tested". Locking cancels a pending change. Every transition is written to the address history.

## 8. Suggested data model

| Table | Key fields |
|---|---|
| operators | name, brand, settings (hold length, defaults) |
| clients | operator_id, name, fee_percent, schedule, gas_payer, two_person, multisig, require_test_payment, treasury_wallet |
| users | client_id or operator_id, role (operator_admin, preparer, approver, employee), email |
| employees | client_id, name, type (employee, contractor), monthly_pay, currency, payout_primary, payout_secondary, split_percent, kyc_status, invited_at, setup_at |
| wallet_addresses | employee_id, address, network, source (employer, employee_signed), signature, locked, tested, screening_status, pending_address, pending_since |
| address_events | employee_id, actor, action, old_address, new_address, at |
| pay_runs | client_id, label, pay_date, status, funding_asset, totals, prepared_by, approved_by, signed_with, sent_at |
| run_lines | run_id, employee_id, kind (salary, bonus, invoice, reimbursement), gross, deduction, net, currency, skipped |
| payouts | line_id, option, share_percent, amount, locked_rate, usd_value, stage, state, tx_hash, failure_reason, address_snapshot |
| ramp_partners | operator_id, currency, on_ramp, off_ramp, adapter, config |
| plugins | operator_id, country, enabled |
| notifications | to, subject, kind, sent_at |
| webhooks, api_keys | operator_id, url, events, secret |

The in-memory shape in the prototype (`S.staff`, `S.run`, `S.history`, `S.clients`) maps onto these tables. The build adds `payslips` (root, doc_hash, salts, employer_signature, anchor_tx) and `idempotency_keys`.

## 9. Interfaces to define

```
SwapProvider (Sera.cx is the default)
  getRate(fromStablecoin, toStablecoin, amount)
  settle(payouts, signer)            match to the real Sera.cx interface

RampAdapter (one per partner and currency)
  getDepositInstructions(client, amount, currency)
  confirmFundsReceived(reference)
  startEmployeeVerification(employee)
  getVerificationStatus(employee)
  createBankPayout(employee, amount, currency)
  getPayoutStatus(payoutId)

ScreeningProvider
  screen(address, network)           returns clear or flagged with a reason

StatutoryPlugin (one per country)
  compute(gross, employee, period)   returns deductions and net

Notifier
  send(to, kind, data)
```

The build adds `ChainAdapter` (balances, batched disbursement, payslip anchoring, receipts). All of them are in `packages/core/src/interfaces.ts`.

API and webhook sketch (also shown under Operator, API and webhooks; the full contract is in [API.md](API.md)):

```
POST /v1/employees/import      upload a pay file
POST /v1/runs                  create a draft run
POST /v1/runs/{id}/submit      preparer submits
POST /v1/runs/{id}/approve     approver signs and sends
GET  /v1/runs/{id}/payouts     stage of every payout
POST /v1/payouts/{id}/retry    retry one failed payout
GET  /v1/runs/{id}/export      accounting export

Webhooks: run.submitted, run.sent, payout.screened, payout.swapped,
payout.sent, payout.arrived, payout.failed, payout.held,
address.change_requested, address.locked
```

## 10. Pay file format for bulk import

```
name,salary,currency,address,type
Siti Aminah,5200,MYR,0x4b1D...c1D4,Employee
Maria Lim,3800,SGD,,Employee
```

Address and type are optional. Type defaults to Employee. Reject a row with a missing name, a salary that is not above zero, an unsupported currency or a malformed address, and report each rejected line. See `importCsv()` (now `parsePayFile()` in core). The real build should also catch duplicate people and duplicate addresses.

## 11. Security requirements

- Address changes are the main payroll fraud route. Require re-authentication for a change, verify the wallet signature on the server, apply the hold, and notify both the employee and the employer admin.
- Enforce preparer and approver separation on the server, not only in the UI.
- Write an audit record for every address, lock, approval and payout action, with who and when.
- Keep personal data to the minimum. No bank details. Treat salary data as confidential and scope every query by client.
- Screen before every payout, not only when the address is added.
- Payout retries must never pay twice.
- Escape all user-supplied text. The prototype does this with `esc()`.

## 12. Risks to keep visible

- **Employment law:** many countries require salary for formal employees to be paid in legal tender. Contractors and opt-in portions of pay are the safer starting ground. Operators need local legal advice. Put this in the README.
- **Licensing:** moving salaries and handling fiat are regulated. The operator and its ramp partners carry the licences. Sera.cx holds no licence of its own, so the Sera.cx-hosted demo must stay on a testnet and must never move real salaries.
- **Forks can reroute swaps.** Keep Sera.cx as the default SwapProvider. The non-USD pairs are the reason to stay on it.
- **Batch size:** pay runs to hundreds of wallets need batched transactions and low fees. Design for the Sera.cx appchain once it is live.

## 13. Brand and copy rules (Sera.cx Green Field)

- Sera green `#00D26A` is the primary colour. White or green-tinted backgrounds only. No black backgrounds. Black is for type and linework.
- Inter ExtraBold for headlines. Chivo Mono Bold or ExtraBold for figures.
- Write "Sera.cx", never "Sera" alone. Singapore and British spelling. No em dashes.
- Say "stablecoin", never "token", for the currency.
- Sera.cx settles with actual liquidity. Never describe it as "quoting".
- The operator's brand leads. "Settlement by Sera.cx" is the only Sera.cx mark in the operator's product.

## 14. Placeholders to replace

`[YOUR PAYROLL BRAND]`, `[REPO LINK]`, `[PARTNER NAME]`, `[ON-RAMP PARTNER ACCOUNT]`, `[YOUR DOMAIN]`. All names, salaries, client names, rates (4.20 MYR, 1.30 SGD, 16,500 IDR and 150 JPY per USD), fees and wallet addresses in the prototype and sample data are samples.

## 15. Suggested build order, with status

| Step | Done when | Status in this repo |
|---|---|---|
| 1. **Scaffold:** repo, database with the tables above, accounts and roles, and the UI ported screen for screen. | Every view in the prototype exists against real stored data. | Done. `packages/db` holds the schema (Postgres, PGlite locally), `apps/api` the sessions and roles, `apps/web` the three views. |
| 2. **Employees:** add, edit, remove, bulk import, invite links, address entry by employer, address signing by employee with server-side verification, lock, hold, history. | The address rules in sections 4 and 7 pass tests. | Done. Rules in `packages/core/src/address.ts` with tests; signature verification and the hold in `apps/api`. |
| 3. **Pay run engine:** schedules, lines, one-offs, skip, fees, blocking issues, funding check, preparer and approver flow. | Totals match the prototype for the same inputs. | Done. `packages/core/src/engine.ts`; `engine.test.ts` checks the sample client against the prototype's figures. |
| 4. **On chain:** wallet connection, testnet stablecoins, batched payouts, Sera.cx swap integration, stages from chain events, idempotent retry. | A testnet run pays several wallets in different stablecoins. | Built against Sera.cx's Sepolia API (section 18) with `PayrollDisburser` and `TestStablecoin` contracts ready to deploy from `contracts/`. Contracts are deployed on Sepolia and a testnet run has paid two wallets in two stablecoins (tMYRT and tUSDT) through `PayrollDisburser` and anchored a payslip (`contracts/deployments/sepolia-sample-run.json`), using the same core and chain code as the payout worker. A run driven through the hosted API with Sera.cx swaps waits on an operator deployment. |
| 5. **Screening and ramps:** screening provider, RampAdapter interface with one mock adapter, employee verification hand-off, bank funding and bank payout states. | | Done with mock adapters. The pattern screening rule is the default, with an optional Chainalysis sanctions check. Real ramp partners are the operator's. |
| 6. **Records and messages:** PDF payslip, accounting export, email notifications, outbox log. | | Done. PDF and CSV from the API, outbox as the log, SMTP behind `Notifier`. On-chain payslip commitments added (see [ON_CHAIN_PAYSLIP.md](ON_CHAIN_PAYSLIP.md)). |
| 7. **Operator:** clients with their own rosters and fees, plug-in interface with one sample plug-in, API and webhooks. | | Done. Sample flat-rate plug-in only; real country plug-ins are the operator's. |
| 8. **Public demo:** hosted on a testnet with the demo banner, a reset, sample data, and a README that explains what a fork must add. | | Live at https://sera-cx.github.io/sera-payroll/ (mock mode, every screen prerendered and indexable; see docs/DEPLOY.md). Contracts are deployed on Sepolia (contracts/deployments/sepolia.json) and a sample run has been paid and anchored through them; the verifier page checks that proof against the registry. The server build is deployable and waits on a hosting account. |

Suggested stack, change freely: TypeScript, React, a Postgres database, and a standard Ethereum wallet library (this build uses viem and wagmi, Fastify, Drizzle and Foundry). Keep every outside service behind the interfaces in section 9 so forks can swap them.

## 16. Where things are in the prototype's script

| Function | What it shows | In this repo |
|---|---|---|
| `runInfo` | Schedule, pay dates and pay fraction | `core/src/schedule.ts` |
| `lines`, `legsFor` | Run lines, deductions, splits, blocking issues, screening flag | `core/src/engine.ts` |
| `totals` | Employer total, fees, funding check, whether the run can be sent | `core/src/engine.ts` |
| `pathSteps`, `rateLine` | The route and rate shown for each payout | `core/src/engine.ts` |
| `submitRun`, `openSign`, `confirmSend` | Approval and sending | `apps/api` run routes, `core/src/run.ts` |
| `buildRecord`, `tick`, `retry` | Run record, payout stages, failure and retry | `core/src/run.ts`, `apps/api` worker |
| `empSetAddr`, `staffApply`, `toggleLock`, `approvePending`, `cancelPending` | Address entry, signing, lock and hold | `core/src/address.ts` |
| `importCsv` | Pay file import and validation | `core/src/payfile.ts` |
| `csvFor`, `slipText` | Accounting export and payslip contents | `core/src/payfile.ts` |
| `pickClient` | Per-client data separation | `apps/api` tenancy |
| `employerRun`, `employerStaff`, `employerHistory`, `employeeView`, `operatorView`, `signDialog` | The screens | `apps/web` |

## 17. Still open

- Is employee self-service address change on by default, or does it need employer approval? Current default: self-service with the hold.
- Which networks at launch besides Ethereum, and when to move to the Sera.cx appchain.
- Exact rate-lock window and what happens when a locked rate cannot be met. (Sera.cx's executable rate lives about 30 seconds, so the practical answer is: lock at signing, settle at once, and re-fetch with a bounded slippage tolerance if a leg fails with `QUOTE_STALE` or `SLIPPAGE_EXCEEDED`. The tolerance is still to be decided.)
- Whether a held payout can be released after review, and by whom.
- Whether one-off payments need their own approval limit.
- Licence for the repo. (Chosen for now: MIT, matching `sera-cx/sera-mcp`.)

## 18. Sera.cx integration, as found in the docs and code

Recorded on 15 November 2026 from `sera-cx/sera-docs` (`docs/en/api-reference/*`), `sera-cx/sera-mcp` (`src/sera/*`), `sera-cx/sera-pay` (`server/sera-*.ts`) and `sera-cx/orderbook-contract-v2` (branch `audit`), with the endpoints checked live. The older local copies of sera-pay and the webapp describe a legacy interface (`testnet-api.sera.cx/v1/...`, a dead `SignOrder` typehash) and must not be used.

### Base URLs and authentication

| | Mainnet | Testnet |
|---|---|---|
| API | `https://api.sera.cx/api/v1` | `https://api-testnet.sera.cx/api/v1` |
| Chain | Ethereum, chainId 1 | Sepolia, chainId 11155111 |
| UI and docs | `https://sera.cx`, `https://docs.sera.cx` | `https://testnet.sera.cx`, `https://docs.testnet.sera.cx` |

- API key header: `Authorization: Bearer {api_key}:{api_secret}`. Keys are read-only and are needed only for `/orders`, `/fills`, `/balances`, `/permit/metadata` and the transaction builders. They are created by signing EIP-712 `ManageApiKey(address owner,string action,uint256 timestamp)` and posting to `/api-keys`; the secret is shown once.
- Unauthenticated: `/health`, `/system/time`, `/tokens`, `/markets`, `/config`, `/swap/quote`, `/swap/quote/batch`, `/verify-signature`.
- `POST /swap` is authenticated by the EIP-712 signature in its body, not by an API key.
- Rate limits per wallet: read 10/s, trade 5/s. Errors arrive as `{"detail": ...}`; every 5xx is mapped to 503 with `Retry-After: 1`. Send `owner_address` in lower case on read endpoints.

### The swap flow

1. `GET /config` for `chain_id`, `sera_address`, `vault_address`, `sor_address` and the EIP-712 domain. Always read it; the addresses in older broadcast files are stale.
2. `GET /tokens` for addresses and decimals. `GET /system/time` for deadlines.
3. `POST /swap/quote` with `{from_token, to_token, from_amount (raw uint256 string), owner_address, recipient, expiration, gas_mode}`. `recipient` may be a third party and the contract enforces it, which is exactly a payroll payout. The response carries `uuid`, `route_params` (the Intent fields), `fee_breakdown`, `expires_at` (about 30 seconds) and, when a deposit is needed, a `permit` block with ready-made EIP-712 typed data. `minOutputAmount: "0"` means no executable route. Up to 50 at once with `POST /swap/quote/batch`.
4. Sign `route_params` exactly as returned as the primary type `Intent`, and the permit when present.
5. `POST /swap` with `{uuid, signature, permit_signature, permit_deadline}`. The response is `{success, trade_id, status: "pending"}`. Error codes: `ALLOWANCE_INSUFFICIENT`, `INTENT_DEADLINE_EXPIRED`, `SLIPPAGE_EXCEEDED`, `NO_LIQUIDITY`, `QUOTE_STALE` (409: re-fetch, nothing consumed), `AMOUNT_BELOW_MIN`, `STP_BLOCKED`, `TRANSIENT_SETTLEMENT_FAILURE`. 410 means the quote expired or was already used.
6. Poll `GET /orders/{trade_id}` (API key) until `status` is `settled` or `failed`. `settlement_summary.latest_tx_hash` and `GET /fills/{order_id}` give the transaction hash per fill. There are **no webhooks**; polling or watching `SeraSOR.IntentMatched(bytes32 intentHash, address taker, uint256 legCount)` on chain are the two options. The order response does not include the recipient, so a careful integration also checks the ERC-20 `Transfer` log to the employee's address.

### EIP-712

Domain `{ name: "Sera", version: "1", chainId, verifyingContract: <sera_address from /config> }`. Mainnet Sera is `0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198`; Sepolia Sera is `0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e` at the time of writing. The verifying contract is Sera, not the SOR.

```
Intent(address taker,address inputToken,address outputToken,uint256 maxInputAmount,
       uint256 minOutputAmount,address recipient,uint256 initialDepositAmount,
       uint256 uuid,uint48 deadline)
```

Other structs (`Order`, `CancelOrder`, `WithdrawIntent`) are for limit orders and withdrawals and are not needed here.

### Contracts

| | Mainnet | Sepolia (from live `/config`) |
|---|---|---|
| Sera | `0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198` | `0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e` |
| Vault | `0xC7d4Fd2638e6630C8C61329878676b88A8A24D43` | `0x3c7945840bAE0d7e7f3824Ebccef1962629250F0` |
| SeraSOR | `0xa7A0cf7cd6f043fCA23f29d8ae5aae6b46e11c18` | `0x83c1368110B640A729f3810De5FBe94b99aa5668` |
| SeraBatcher | `0x1f4b366f4145A92978df4bEeb6BdE71bC652F034` | |

`SeraSOR.executeIntent` is executor-only; a client never calls it. User-callable: `depositFund`, `depositFundWithPermit`, `executeInstantWithdrawDualSig`, `emergencyWithdraw` (about 24 hour delay), `getIntentDigest`, `DOMAIN_SEPARATOR`, `Vault.balanceOf`.

### Stablecoins

Mainnet (from `/tokens` and `docs/en/currency-pairs.md`; about 40 stablecoins across 22 currencies are listed):

| Symbol | Address | Decimals |
|---|---|---|
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| USDT | `0xdac17f958d2ee523a2206206994597c13d831ec7` | 6 |
| MYRT | `0x3Fc98a885E99420d0ce43Bcb81bF21A4e3F45E5f` | 6 |
| XSGD | `0x70e8de73ce538da2beed35d14187f6959a8eca96` | 6 |
| IDRT | `0x998FFE1E43fAcffb941dc337dD0468d52bA5b48A` | 2 |
| JPYC | `0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB` | 18 |

Sepolia (from the live testnet `/tokens`; all 6 decimals):

| Symbol | Address |
|---|---|
| USDC | `0x965d4b4546716e416e950bc30467d128455d2d0e` |
| USDT | `0x8365421d0e1b316fc6398d21be162992216bf2ad` |
| MYRT | `0x66d3b49b587b970b5835751708136adb805f1fe4` |
| XSGD | `0x058e06ca2628165a6cd1e80e4dc82203dc0020aa` |
| IDRT | `0xf295f26f7fe8a5a8a5c15ca56d8d571f891200dc` |
| JPYC | `0x0b2dfe45ca948a5f75e358e4000ed0adf1142150` |

There is no documented public faucet for the Sepolia test stablecoins. This repo's `TestStablecoin` contract gives the demo its own mintable test stablecoins for the disbursement path; swaps on the Sera.cx testnet need its listed stablecoins, so ask the Sera.cx team for test balances.

### Rates

`POST /swap/quote` is the executable rate and the one to show at review and lock at signing. `GET /fx/rate?base=USD&quote=MYR` exists in the client code (`sera-mcp`, `sera-pay`) but is not in the published docs and returned 503 when probed. Treat it as indicative only.

### Screening

No open-source KYT or KYA repository was found under `sera-cx`. The compliance page says Sera.cx screens wallets through an analytics provider and blocklists them. `sera-pay` calls the public Chainalysis sanctions API (`https://public.chainalysis.com/api/v1`). This repo therefore ships the pattern demo rule as the default `ScreeningProvider` with an optional Chainalysis sanctions check, and leaves a real KYT provider to the operator.

### Reusable code

No npm package is published. `sera-cx/sera-mcp` (MIT) has a `SeraClient` with `postSwapQuote`, `postSwap`, `getOrder`, `getFills`, `getConfig`, `getTokens`, token helpers and `INTENT_TYPES`, and a quote registry that freezes `route_params` by `uuid` so they cannot be altered before signing. That pattern, plus a notional cap and a recipient allowlist, is copied in spirit by this repo's `SeraSwapProvider`. `sera-cx/sera-pay` has no licence file, so it was read for the interface but not copied.
