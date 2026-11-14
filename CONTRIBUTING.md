# Contributing

Thank you for helping build an open payroll rail. This project is released so that payroll companies and other operators can fork it and run it under their own brand. Contributions that make forking easier, safer or more complete are the most welcome.

## Before you start

- Read [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md). It holds every decision made so far and the rules the code must keep.
- Read [SECURITY.md](SECURITY.md). Address changes, approvals and signing are the parts of payroll that get attacked.
- Open an issue first for anything larger than a fix, so the approach is agreed before the code is written.

## Ground rules

- **One change per pull request.** One fix, one feature or one adapter. Small PRs get reviewed; large ones wait.
- **Keep every outside service behind its interface.** `SwapProvider`, `RampAdapter`, `ScreeningProvider`, `StatutoryPlugin`, `Notifier` and `ChainAdapter` live in `packages/core/src/interfaces.ts`. A new partner is a new adapter, never a branch in the engine.
- **Sera.cx stays the default `SwapProvider`.** The non-USD pairs are the reason this project exists.
- **No floating point for money.** Use the `Decimal` helpers in `packages/core/src/money.ts` and follow its rounding rule.
- **Server-side rules.** Role checks, preparer and approver separation, address holds and idempotent retries are enforced in `apps/api`, not only in the UI.
- **Brand and copy.** Write "Sera.cx", never "Sera" alone. Say "stablecoin", never "token". Sera.cx settles with actual liquidity; never describe it as "quoting". Singapore and British spelling. No em dashes.
- **Samples stay samples.** Every name, salary, rate, fee and wallet address in the sample data is made up. Do not add real ones.

## Threat-model note

Any pull request that touches signing, wallet addresses, the hold, locks, approval, payout retry, webhooks or API keys must include a short section in its description titled **Threat model** answering:

1. What can an attacker do with this change that they could not do before?
2. Which check on the server stops it?
3. Which test proves the check?

PRs without this section on those paths will be sent back.

## Working locally

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm demo                                    # API on PGlite with sample data
pnpm --filter @sera-payroll/web dev          # web app on http://localhost:5173
```

Contracts live in `contracts/` and use Foundry: `forge build && forge test`.

Run `pnpm typecheck && pnpm test` before opening a PR. CI runs the same plus `forge test`.

## Commit messages and PRs

- Plain English, present tense, say what changed and why.
- Link the issue.
- Fill in the pull request template, including the threat-model checkbox where it applies.

## Reporting a security problem

Do not open a public issue. Use a GitHub private security advisory on this repository. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the MIT licence in [LICENSE](LICENSE).
