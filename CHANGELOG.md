# Changelog

All notable changes to this project are recorded here. The format follows Keep a Changelog and the project uses semantic versioning.

## [Unreleased]

### Added
- Public demo on GitHub Pages: the web app in mock mode, every route prerendered to static HTML with per-page title, description, canonical, Open Graph, Twitter and JSON-LD tags, plus sitemap, robots, 404 fallback and an Open Graph image.
- Landing page, a public payslip proof verifier at `/verify`, and static descriptions of every screen for crawlers.
- Demo deep links: opening any screen signs the visitor in as the sample user for that screen; `?as=<role or user id>` switches.
- Deployment: API Dockerfile (built and booted in CI), Fly.io and Render configs, a manual Sepolia contract deployment workflow, `COOKIE_SAME_SITE` for a web app on another origin, and `docs/DEPLOY.md`.
- Disclosure bundles now carry `chainId`, `registry` and `anchorId` so a verifier can check the anchor on chain.
- Contracts deployed on Sepolia (see `contracts/deployments/sepolia.json`); the landing page lists them.
- One-click Render deployment: `render.yaml` at the repository root and a Deploy to Render button in the README.

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
