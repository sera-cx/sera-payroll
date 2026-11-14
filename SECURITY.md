# Security

## Reporting

Please do not report security problems in public issues. Open a **private security advisory** on this repository (Security tab, "Report a vulnerability"). We aim to acknowledge within three working days.

Give us the version or commit, the steps to reproduce and what an attacker gains. Proof-of-concept code is welcome. Please do not test against anyone's live deployment.

## What this project protects

Payroll is attacked through the address book and the approval step, not through the chain. The design decisions in [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md) section 11 are the threat model. In short:

| Threat | Control |
|---|---|
| An attacker changes an employee's wallet address to their own | Address changes by the employee start a hold (48 hours by default, operator-configurable). Both the employee and the employer admin are notified. The employer can lock an address so nobody can change it. Wallet signatures are verified on the server, never trusted from the browser. |
| A preparer pays themselves | With two-person approval on, the server rejects an approval from the user who prepared the run. This is enforced in the API, not only in the UI. |
| A payout is retried and paid twice | Every approval and retry carries an idempotency key. The worker restarts a failed payout from its first incomplete stage and never re-sends a stage that already has a transaction hash. |
| A sanctioned or flagged address is paid | Every address is screened when added and again before each payout. A flag holds that one payout; the rest of the run goes ahead. |
| Salary data leaks | Every query is scoped by client. Bank details never touch this app: the off-ramp partner holds them. The on-chain payslip holds only salted hashes. |
| User-supplied text is injected into pages or emails | All user text is escaped at render. |
| Funds are held by the operator | They are not. Funds move from the employer's wallet, through Sera.cx, to the employee or the off-ramp partner. Neither the operator nor Sera.cx holds funds or keys. |

Every address, lock, approval and payout action is written to the audit log with who and when.

## What is out of scope

- The public demo runs on a testnet with test stablecoins. Nothing on it is real, so findings against the demo's sample data are not vulnerabilities.
- Partner systems (ramp partners, screening providers, email providers) are behind adapters. Report problems in those systems to those providers.
- Social engineering of an operator's staff.

## Supported versions

The `main` branch. There are no release branches yet.

## Keys and secrets

- The operator's payslip signing key signs payslip roots only. It can never move funds.
- API keys are shown once at creation and stored hashed.
- Webhook secrets sign every delivery with HMAC-SHA256.
- Do not commit `.env` files. The `.env.example` files list every variable.
