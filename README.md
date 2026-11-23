# Sera.cx Payroll

The source-available payroll client for the Sera.cx Protocol. Employers fund a pay run in any supported stablecoin or in fiat. Each employee or contractor chooses what they receive: any supported stablecoin to their wallet, or fiat to their bank. The two choices are independent. Sera.cx is the stablecoin-to-stablecoin swap in the middle; on-ramp and off-ramp partners handle fiat in and fiat out.

**Settlement by Sera.cx.** Sera.cx does not run payroll for anyone. Payroll companies and other operators fork this repository and run it under their own brand and licence, in the same way as the Sera.cx open-source payment gateway.

**Live demo: https://sera-cx.github.io/sera-payroll/** Every screen, running entirely in your browser on sample data. Open any screen and it signs you in as the right sample user.

Three ways to use this repository:

1. **Try the static demo.** The site above needs no server; the API and every adapter are played back in the browser.
2. **Run it locally.** `pnpm install && pnpm demo`, then the web app. See [Quick start](#quick-start).
3. **Deploy your own.** One container for the API, Postgres, and the static web app pointed at it. [Deploy to Render](#deploying) in one click, or any Docker host. The demo site's [Run your own](https://sera-cx.github.io/sera-payroll/run-your-own/) page and [docs/DEPLOY.md](docs/DEPLOY.md) have the notes. 
The contracts are deployed on Sepolia: PayrollDisburser `0x874DE1F483Dd5C053E51cf9e9dAc161452050b85`, PayslipRegistry `0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D` (full list in [docs/DEPLOY.md](docs/DEPLOY.md)). A sample payroll run has been paid through them and one payslip anchored; the [verifier page](https://sera-cx.github.io/sera-payroll/verify/) checks its proof against the registry.

> **Demo only.** The hosted demo runs on a testnet with test stablecoins and sample data. Nothing on it is real and no salary moves. See [Risks](#risks-to-keep-visible).

## Why this exists

Existing stablecoin payroll products pay out in USDT or USDC. Here an employee in Malaysia can receive MYRT, or ringgit by DuitNow, while the employer funds in USDT. Non-USD stablecoins (MYRT, XSGD, IDRT, JPYC and others) are the differentiator, and Sera.cx is where those pairs settle with actual liquidity.

## Who it is for

- **Payroll and EOR companies (operators).** The main audience. Fork it and add it as a payout rail for existing clients.
- **Crypto-native companies** with treasury already in stablecoins, often a multisig. May self-host.
- **Remote-first companies with overseas contractors**, agencies, outsourcers and gig platforms with many small cross-border payouts.
- **Businesses that earn in stablecoins** and want to pay people without converting to fiat first.

Not the target: a local business paying local staff in local currency by bank transfer.

## How funds move

```
employer treasury wallet  (USDT, USDC, MYRT, XSGD, or fiat via on-ramp partner)
          |
          |  signed pay run (EIP-712), one batch
          v
   +--------------+   swap only when the funding stablecoin differs
   |  Sera.cx     |   from the payout stablecoin, settled against
   |  swap        |   actual liquidity, non-custodial, EIP-712 intents
   +--------------+
          |
     +----+----------------------------+
     |                                 |
     v                                 v
employee wallet                 off-ramp partner  -->  employee's bank
(MYRT, XSGD, USDT, USDC,        (holds KYC and bank details;
 IDRT, JPYC on Ethereum)         DuitNow, PayNow, BI-FAST, wire)
```

The operator and Sera.cx never hold funds or keys. Bank details never touch this app. Every payout is screened before it leaves. Rates and addresses freeze when the approver signs.

## Repository layout

```
packages/core      pay run engine, state machines, interfaces, payslip commitments. Pure TypeScript, no I/O.
packages/db        Drizzle schema and migrations. Postgres, with PGlite for local demo and tests.
packages/chain     viem ChainAdapter, contract ABIs, network and stablecoin addresses.
apps/api           Fastify API: sessions and roles, pay runs, payout worker, webhooks, API keys, PDF payslips, demo mode.
apps/web           React web app: Employer, Employee and Operator views, real wallet connection.
contracts          Foundry: TestStablecoin, PayrollDisburser, PayslipRegistry.
docs               build notes, API contract, on-chain payslip design, deployment guide, the original prototype.
deploy             Fly.io config for the API. The Render blueprint is render.yaml at the root.
```

## Quick start

Requires Node 22 and pnpm 10. No database or wallet is needed for the demo.

```bash
pnpm install
pnpm demo
```

That boots the API on http://localhost:4000 in demo mode: an embedded PGlite database, sample clients and people, mock swap, ramp and screening adapters, and an outbox instead of email. In a second terminal:

```bash
pnpm --filter @sera-payroll/web dev
```

Open http://localhost:5173 and sign in as a sample user (preparer, approver, employee or operator admin). Draft a run, submit it, switch to the approver, sign and send, then watch each payout move through its stages. "Reset demo" under Operator puts the sample data back.

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
cd contracts && forge build && forge test
```

## Running it for real

Copy `apps/api/.env.example` and `apps/web/.env.example` to `.env` beside them. The root [`.env.example`](.env.example) maps every variable. The ones that matter:

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string. Unset means PGlite, which is for local use only. |
| `DEMO_MODE` | `true` turns on sample users, "sign in as", demo reset and the permanent demo banner. Off for a real deployment. |
| `BRAND` | The operator's brand. It leads everywhere; "Settlement by Sera.cx" is the only Sera.cx mark. |
| `CHAIN`, `RPC_URL` | `sepolia` for the demo, `ethereum` for production. Never assume the network; it is stored with every address. |
| `SWAP_PROVIDER` | `sera` or `sample`. Keep Sera.cx as the default; `sample` is fixed demo rates. |
| `SERA_API_BASE` | `https://api-testnet.sera.cx/api/v1` on Sepolia, `https://api.sera.cx/api/v1` on mainnet. |
| `SERA_API_KEY`, `SERA_API_SECRET` | Read-only key used to poll settlement status. |
| `PAYROLL_DISBURSER_ADDRESS`, `PAYSLIP_REGISTRY_ADDRESS` | Your deployments from `contracts/`. |
| `OPERATOR_SIGNER_PRIVATE_KEY` | Signs payslip roots and relays anchors. It never holds funds. |
| `SMTP_URL`, `SMTP_FROM` | Email provider. Unset keeps the outbox log only. |
| `CHAINALYSIS_API_KEY` | Optional sanctions check in addition to the default screening rule. |

The approver signs the pay run with the client's treasury wallet (single wallet or multisig) in the browser. The server never holds that key.

Deploy the contracts with the scripts in `contracts/` and point the API at them. The Sepolia stablecoin addresses Sera.cx publishes are listed in [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md) section 18.

## What a fork must add

This repository is complete as a simulation and as a rail, but an operator going live has to supply:

1. **A database and an email provider.** Postgres is wired; pick your host. Implement `Notifier` for your email service; the outbox stays as the log.
2. **Ramp partner adapters.** One `RampAdapter` per licensed partner and currency: deposit instructions, funds confirmation, hosted KYC hand-off, bank payout creation and status. A mock adapter ships as the example.
3. **Screening.** A real `ScreeningProvider`. The default is a demo pattern rule with an optional Chainalysis sanctions check. Screen before every payout, not only when the address is added.
4. **Statutory plug-ins.** One `StatutoryPlugin` per country with real rules. The sample plug-in is a flat percentage and is not a real rate. Contractors are paid gross.
5. **Accounts and SSO.** Sessions, magic links and sign-in with Ethereum are wired. Connect your identity provider and your existing payroll user base.
6. **Licences.** Moving salaries and handling fiat are regulated. You and your ramp partners carry the licences.
7. **Your brand.** Replace `[YOUR PAYROLL BRAND]`, `[REPO LINK]`, `[PARTNER NAME]`, `[ON-RAMP PARTNER ACCOUNT]` and `[YOUR DOMAIN]`.

Every outside service sits behind an interface in [`packages/core/src/interfaces.ts`](packages/core/src/interfaces.ts): `SwapProvider` (Sera.cx is the default), `RampAdapter`, `ScreeningProvider`, `StatutoryPlugin`, `Notifier` and `ChainAdapter`.

## Rules the code keeps

These come from the build notes and are covered by tests in `packages/core`:

- Wallet address by either route: the employer enters it, or the employee signs with their own wallet. An employer-entered address is good for payout without employee confirmation.
- An employee changing an existing address starts a hold (48 hours by default, set by the operator). The employer can approve early or reject; the employee can cancel. A first-time address has no hold. The employer can lock an address.
- Addresses and rates freeze when the run is signed. Later edits apply to the next run.
- A screening flag holds that one payout; the rest of the run goes ahead. A missing address, a missing off-ramp partner or an unverified employee blocks the whole run.
- With two-person approval on, the preparer cannot approve their own run. Enforced on the server.
- Retries are idempotent. A payout is never paid twice.
- Money is decimal, never floating point. IDR and JPY use 0 decimal places. The rounding rule is in `packages/core/src/money.ts`.
- Every address, lock, approval and payout action is written to the audit log with who and when.

## On-chain payslips

Each payslip is sealed as a salted Merkle tree, signed by the employer and anchored on the same chain as the payout. The employee can prove a single field, such as net pay, to a lender without revealing the rest, and anyone can verify it against the chain. Salary data never goes on chain in the clear. Design: [docs/ON_CHAIN_PAYSLIP.md](docs/ON_CHAIN_PAYSLIP.md).

## Risks to keep visible

- **Employment law.** Many countries require salary for formal employees to be paid in legal tender. Contractors and opt-in portions of pay are the safer starting ground. Operators need local legal advice.
- **Licensing.** Moving salaries and handling fiat are regulated. The operator and its ramp partners carry the licences. Sera.cx holds no licence of its own, so the Sera.cx-hosted demo stays on a testnet and never moves real salaries.
- **Swaps stay on Sera.cx.** The licence requires every stablecoin-to-stablecoin exchange in production to go through the Sera.cx Protocol, and the non-USD pairs are the reason to want to. The `SwapProvider` interface exists so the sample provider can stand in for tests and demos, not so a fork can route elsewhere.
- **Batch size.** Pay runs to hundreds of wallets need batched transactions and low fees. Design for the Sera.cx appchain once it is live.

## Demo labelling

Any public demo of this software must carry a permanent banner saying it is a demo, that nothing is real, and that the code is free to fork. The web app shows it whenever `DEMO_MODE` is on.

## Brand rules for forks

The operator's brand leads. "Settlement by Sera.cx" is the only Sera.cx mark that appears in an operator's product. Write "Sera.cx", never "Sera" alone. Say "stablecoin", never "token". Sera.cx settles with actual liquidity; do not describe it as quoting. Sera green `#00D26A` is the primary colour, on white or green-tinted backgrounds. Details in [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md) section 13.

## Documentation

- [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md): the full brief, every decision, data model, state machines, build order and status, Sera.cx integration facts.
- [docs/API.md](docs/API.md): the HTTP API contract.
- [docs/ON_CHAIN_PAYSLIP.md](docs/ON_CHAIN_PAYSLIP.md): on-chain payslip design.
- [docs/prototype](docs/prototype): the original single-file prototype, the reference for behaviour.
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).

## Deploying

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sera-cx/sera-payroll)

The button deploys the API, a Postgres database and the web app from `render.yaml`; Render asks for three URLs during setup, which [docs/DEPLOY.md](docs/DEPLOY.md) explains. That guide also covers the other pieces: the public demo on GitHub Pages (static, prerendered, rebuilt on every push), the contracts on Sepolia (`forge script` locally or the manual GitHub workflow), and the full stack (one Docker image for the API, Postgres, and the web app pointed at it, with Fly.io and Render configs in `deploy/`).

## Licence

[Sera.cx Payroll Source Licence 1.1](LICENSE), with the Licensor and contact in [NOTICE](NOTICE). In plain words:

- **You may** use, change, rebrand, sell and redistribute the software, free of charge, under your own brand. Fiat on-ramps and off-ramps, screening, statutory plug-ins, notifications, database and hosting are all your choice.
- **The licence covers one form only:** a form in which every stablecoin-to-stablecoin exchange a production pay run needs goes through the Sera.cx Protocol, no code or configuration routes it elsewhere, and "Settlement by Sera.cx" stays where the app shows it. Copying, modifying, distributing or running the software in production in any other form is outside the licence.
- **Going around it counts.** Swapping in your own treasury to fund a run, converting to fiat and back to avoid the Protocol, or having a partner do the swap for you are all breaches. Operators keep records of production settlement and provide them on request.
- **Or pay instead.** Operators who want to settle elsewhere can take a paid commercial licence without the settlement condition, on reasonable and non-discriminatory terms, through the contact in [NOTICE](NOTICE). The condition is the price of the free licence, not a requirement to deal with Sera.cx at all; what you do in other software or other parts of your business is untouched.
- **Consequences.** Any such act infringes the Licensor's copyright and breaches the licence agreement. It ends your licence immediately and permanently, with no cure period, and the Licensor may seek an injunction, damages or an account of profits, and its legal costs. A thirty-day window lets you finish payouts already approved and funded, through the Protocol, so employees are not harmed.
- **Not restricted:** testnets, local development, automated tests, demos on sample data (the `sample` swap provider and the provider interface itself), bank payouts, payouts where the funding and payout stablecoin are the same, and the case where a law requires a payment the Protocol cannot meet, with notice to the Licensor.
- The smart contracts in [`contracts/`](contracts/) are under the [MIT licence](contracts/LICENSE), so deployed and verified source stays as published.

This is a source-available licence, not an open-source licence as the Open Source Initiative defines one. Contributions are assigned to the Licensor and licensed back under the same licence (see [CONTRIBUTING.md](CONTRIBUTING.md)).
