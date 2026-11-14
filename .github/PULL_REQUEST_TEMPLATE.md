## What this changes

One change per pull request. Say what and why, and link the issue.

## How it was tested

- [ ] `pnpm typecheck && pnpm test` pass locally
- [ ] `forge test` passes (if `contracts/` changed)
- [ ] Checked in the web app against the demo API (if a screen changed)

## Threat model

Required when this PR touches signing, wallet addresses, the hold, locks, approval, payout retry, webhooks or API keys. Delete this section otherwise.

- [ ] This PR touches one of the paths above and the three questions below are answered.

1. What can an attacker do with this change that they could not do before?
2. Which check on the server stops it?
3. Which test proves the check?

## Checklist

- [ ] Outside services stay behind their interfaces
- [ ] No floating point for money
- [ ] Copy follows the brand rules ("Sera.cx", "stablecoin", no "quoting", British spelling, no em dashes)
- [ ] Sample data stays sample data
