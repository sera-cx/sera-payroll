# Changelog

All notable changes to this project are recorded here. The format follows Keep a Changelog and the project uses semantic versioning.

## [Unreleased]

### Changed
- Dependencies: closes the Dependabot alerts on the default branch. Direct bumps: nodemailer 6 to 10 (ships its own types, so `@types/nodemailer` is dropped), drizzle-orm 0.38 to 0.45 and drizzle-kit 0.30 to 0.31, zod 3 to 4 in the API, react-router-dom 6 to 7 (`StaticRouter` now comes from the main entry and the `future` flags are gone), vitest 2 to 4 in every package, vite 6.4.4 or later. Root `pnpm.overrides` pin the transitives ws 8.21, uuid 11.1.1, decode-uri-component 0.5.1 and esbuild 0.25. One alert remains: zod 3 inside the Coinbase wallet connector that wagmi pulls in, which upstream still pins; forcing zod 4 there would risk breaking wallet connections, so it waits for upstream.
- Licence 1.1 (`LICENSE`, new `NOTICE`): the settlement condition is now a limit on the scope of the copyright grant rather than a covenant, so a non-compliant fork is both infringement and breach of contract. Adds anti-circumvention wording (treasury pre-swaps, fiat round trips, swaps by a partner), an express remedies section (injunction, damages or account of profits, costs, Protocol fees as a minimum measure of loss), an acceptance clause, a records and verification duty, a thirty-day wind-down for payouts already funded, a legal-obligation exception with notice, contributor copyright assignment to the Licensor, a quality-control clause for the mark, and a Protocol Register with notice periods in place of "as published from time to time". A paid commercial licence without the settlement condition is offered (section 2.4), and other software and business are expressly outside the licence (3.5(f)). The Licensor is identified in `NOTICE`, which still needs the registered entity details.
- Licence: the application code moves from MIT to the Sera.cx Payroll Source Licence 1.0 (`LICENSE`). Forks may use, rebrand, sell and redistribute, but production stablecoin-to-stablecoin settlement must go through the Sera.cx Protocol and that condition cannot be removed; breach terminates the licence immediately and permanently. The smart contracts stay MIT (`contracts/LICENSE`). Site copy says source-available rather than open source.

### Added
- Public demo on GitHub Pages: the web app in mock mode, every route prerendered to static HTML with per-page title, description, canonical, Open Graph, Twitter and JSON-LD tags, plus sitemap, robots, 404 fallback and an Open Graph image.
- Landing page, a public payslip proof verifier at `/verify`, and static descriptions of every screen for crawlers.
- Demo deep links: opening any screen signs the visitor in as the sample user for that screen; `?as=<role or user id>` switches.
- Deployment: API Dockerfile (built and booted in CI), Fly.io and Render configs, a manual Sepolia contract deployment workflow, `COOKIE_SAME_SITE` for a web app on another origin, and `docs/DEPLOY.md`.
- Disclosure bundles now carry `chainId`, `registry` and `anchorId` so a verifier can check the anchor on chain.
- Contracts deployed on Sepolia (see `contracts/deployments/sepolia.json`); the landing page lists them.
- One-click Render deployment: `render.yaml` at the repository root and a Deploy to Render button in the README.
- A sample payroll run paid on Sepolia through `PayrollDisburser` with one payslip anchored in `PayslipRegistry` (`packages/chain/scripts/sepolia-sample-run.ts`, record in `contracts/deployments/sepolia-sample-run.json`). The verifier page offers that proof and checks it against the contract; the landing page links the transactions.

## [0.1.0] - Unreleased

### Added

- Initial build from the single-file prototype in `docs/prototype`.
- `packages/core`: pay run engine with decimal maths, schedules, blocking issues, screening holds, funding check, pay run and payout and wallet address state machines, pay file import, accounting export, payslip text, the service interfaces (SwapProvider, RampAdapter, ScreeningProvider, StatutoryPlugin, Notifier, ChainAdapter) and on-chain payslip commitments (salted Merkle tree, EIP-712 types).
- `packages/db`: Postgres schema with a PGlite fallback for local demo and tests.
- `packages/chain`: viem adapter, contract ABIs and Sepolia addresses.
- `apps/api`: Fastify API with sessions, roles, two-person approval, payout worker, webhooks, API keys, PDF payslips and a demo mode with sample data and reset.
- `apps/web`: React port of every prototype screen with a real wallet connection.
- `contracts`: TestStablecoin, PayrollDisburser and PayslipRegistry with Foundry tests.
- Sera.cx SwapProvider against the published swap API, with a mock provider for the demo.
- Documentation: README, build notes, on-chain payslip design, API contract.
