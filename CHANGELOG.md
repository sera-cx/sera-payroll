# Changelog

All notable changes to this project are recorded here. The format follows Keep a Changelog and the project uses semantic versioning.

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
