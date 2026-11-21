# Deploying Sera.cx Payroll

The hosted demo is static: the web app runs the whole product in the visitor's browser on sample data, so it needs no server and costs nothing to host. A developer or payroll operator who wants to pay people for real deploys the server build themselves. This guide covers both, plus the contracts. The demo site's [Run your own](https://sera-cx.github.io/sera-payroll/run-your-own/) page is the short version.

Three things can be deployed, independently:

| Piece | What it is | Where the reference deployment lives |
|---|---|---|
| **Public demo** | The web app built in mock mode. The whole product runs in the visitor's browser on sample data. No server. | GitHub Pages: https://sera-cx.github.io/sera-payroll/ |
| **Contracts** | `PayrollDisburser`, `PayslipRegistry` and two demo stablecoins on Sepolia. | Deployed. Addresses in `contracts/deployments/sepolia.json` and below. |
| **Full stack** | The API with Postgres, the payout worker, webhooks, PDF payslips and real wallet signing, plus the web app pointed at it. | Any Docker host. One-click Render blueprint at `render.yaml`; Fly.io config in `deploy/`. |

Nothing on the public demo moves real money. Keep every hosted demo on a testnet; the build notes explain why.

## 1. Public demo on GitHub Pages

Already wired up. `.github/workflows/pages.yml` runs on every push to `main` that touches `apps/web` or `packages/core`, and on demand from the Actions tab.

What the build does:

1. `vite build` with `VITE_MOCK_API=1`, `VITE_BASE=/sera-payroll/` and `VITE_SITE_URL=https://sera-cx.github.io/sera-payroll`.
2. A second, server-side build of `apps/web/src/entry-static.tsx`.
3. `scripts/prerender.mjs` writes one `index.html` per route from `apps/web/src/seo.ts`, each with its own title, description, canonical URL, Open Graph and Twitter tags and JSON-LD, plus `sitemap.xml`, `robots.txt`, `404.html` and `.nojekyll`.
4. `actions/deploy-pages` publishes `apps/web/dist`.

Every screen has a page: the landing page, the verifier, build notes, sign-in, five employer screens, the employee view and four operator screens. Opening any of them signs the visitor in as the sample user that screen is for; `?as=approver` (or any role or sample user id) switches user. Section roots such as `/employer/` have a page too, and unknown paths get `404.html`, which boots the app and lets the router decide.

To fork the demo under your own account, nothing changes: the workflow derives the base path and site URL from the repository name and owner. Enable Pages once with the source set to GitHub Actions:

```bash
gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow
```

To serve the demo from your own domain, add a `CNAME` file to `apps/web/public/`, set `VITE_BASE=/` and `VITE_SITE_URL=https://payroll-demo.example.com` in the workflow, and point a CNAME record at `<owner>.github.io`.

### Checking a build locally the way Pages serves it

```bash
cd apps/web
VITE_MOCK_API=1 VITE_BASE=/sera-payroll/ VITE_SITE_URL=http://localhost:4173/sera-payroll pnpm build
VITE_BASE=/sera-payroll/ pnpm preview:static     # http://localhost:4173/sera-payroll/
```

### Search engines

- Each route is static HTML before any JavaScript runs, so crawlers that do not execute scripts still see the heading, description, what the screen does and links to its siblings. Crawlers that do execute scripts see the live app.
- `sitemap.xml` lists the fourteen indexable pages; the invite page is `noindex`.
- Canonicals end with a slash to match the folders Pages serves. Pages redirects the slash-less form.
- Open Graph image: `apps/web/public/og.png` (1200 by 630). Favicon and touch icon sit next to it.
- Titles are `<screen> · Sera.cx Payroll demo`; the landing page is `Sera.cx Payroll: source-available stablecoin payroll`. Change `SITE_NAME` and the route table in `apps/web/src/seo.ts` when you rebrand.
- After the first deploy, submit `https://<site>/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Both need you to verify ownership of the GitHub Pages site (an HTML file in `apps/web/public/` works).

## 2. Contracts on Sepolia

Three contracts, all permissionless and holding no funds. Details in [`contracts/script/README.md`](../contracts/script/README.md).

### Deployed addresses (Sepolia, chain id 11155111)

| Contract | Address |
|---|---|
| PayrollDisburser | [`0x874DE1F483Dd5C053E51cf9e9dAc161452050b85`](https://sepolia.etherscan.io/address/0x874DE1F483Dd5C053E51cf9e9dAc161452050b85) |
| PayslipRegistry | [`0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D`](https://sepolia.etherscan.io/address/0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D) |
| TestStablecoin tUSDT (6 dp, faucet) | [`0x608007F91A38D43E964939C2F29c4397349F71AC`](https://sepolia.etherscan.io/address/0x608007F91A38D43E964939C2F29c4397349F71AC) |
| TestStablecoin tMYRT (6 dp, faucet) | [`0xCc0054146fBE0105655633ce4ebb2930acc3FFC1`](https://sepolia.etherscan.io/address/0xCc0054146fBE0105655633ce4ebb2930acc3FFC1) |

Deployed on 15 November 2026 by `0xeB17b3F4ea77178Dc6ad94f026CF76D790868154`, a throwaway key that only ever held testnet ETH. Sources are verified on Sourcify (exact match) and show on Etherscan through it.

### A sample run on these contracts

On 16 November 2026 the October 2026 payroll of the first sample company (Sample Studio Sdn Bhd) was paid through them with the demo stablecoins, and one payslip was anchored:

| Step | Transaction |
|---|---|
| Two payouts (8500.00 tMYRT and 428.57 tUSDT) in one `disburse` | [`0xeca6d0…9b08e`](https://sepolia.etherscan.io/tx/0xeca6d081fe8bcf6c6a9375922281fe52dbc9373a63d8e05e67589e4c9e59b08e) |
| Aisyah Rahman's payslip root anchored, signed by the employer | [`0x3e2a9e…3b6f9`](https://sepolia.etherscan.io/tx/0x3e2a9e87357365fb8bba82957b93a0fde170df9ba1acd17b73700b43d413b6f9) |

The run record is `contracts/deployments/sepolia-sample-run.json`. The proof bundle the demo's verifier page offers (`apps/web/src/data/sepolia-sample-proof.json`) discloses five fields of that payslip; the undisclosed salts stay off the repository. The script is `packages/chain/scripts/sepolia-sample-run.ts`:

```bash
pnpm exec tsx packages/chain/scripts/sepolia-sample-run.ts   # reads PRIVATE_KEY and SEPOLIA_RPC_URL from contracts/.env
```

It uses the same `@sera-payroll/core` and `@sera-payroll/chain` code as the API's payout worker: mint and approve, `disburse`, seal, EIP-712 sign, `anchor`, `disclose`. Re-running it is safe; the disburser skips paid legs and the registry records a correction when the root changes. A fork with its own deployment can run it as a smoke test before pointing the API at the contracts.

### Gas on current Sepolia

Sepolia prices contract creation far above what Foundry's local simulation assumes (the node estimated 4.2M gas for `PayrollDisburser` where the cancun simulation used 615k), so a plain `forge script --broadcast` sends too little gas and the first transaction runs out. Pass `--skip-simulation` so Foundry takes the gas estimate from the node, as the commands below do. Public RPC pools can also disagree about the head block during simulation; `https://sepolia.gateway.tenderly.co` was consistent.

### From your machine

```bash
cd contracts
cp .env.example .env    # or create it: PRIVATE_KEY, SEPOLIA_RPC_URL, DEPLOY_TEST_TOKENS
forge build && forge test
forge script script/Deploy.s.sol:Deploy --rpc-url "$SEPOLIA_RPC_URL" --broadcast --skip-simulation --slow -vv
cp deployments/11155111.json deployments/sepolia.json
```

The deployer needs about 0.02 Sepolia ETH. Public RPCs that work without a key include `https://ethereum-sepolia-rpc.publicnode.com` and `https://1rpc.io/sepolia`. For Etherscan verification add `ETHERSCAN_API_KEY` and `--verify`.

### From GitHub Actions

`.github/workflows/deploy-contracts.yml` is a manual workflow. Create an environment called `sepolia` with the secrets `DEPLOYER_PRIVATE_KEY` and `SEPOLIA_RPC_URL` (and optionally `ETHERSCAN_API_KEY`), run the workflow, and merge the pull request it opens with the new `deployments/sepolia.json`.

The deployer key is a throwaway that only ever holds testnet ETH. Never reuse a key that has held real funds.

### After deploying

Put the addresses in the API environment:

```
CHAIN=sepolia
RPC_URL=https://sepolia.gateway.tenderly.co
PAYROLL_DISBURSER_ADDRESS=0x874DE1F483Dd5C053E51cf9e9dAc161452050b85
PAYSLIP_REGISTRY_ADDRESS=0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D
OPERATOR_SIGNER_PRIVATE_KEY=0x...   # signs payslip roots and relays anchors; needs a little Sepolia ETH for gas
```

The web app needs `VITE_CHAIN_ID=11155111`. Treasury wallets must `approve(PAYROLL_DISBURSER_ADDRESS, amount)` on each stablecoin they pay with; the web app offers that step before signing.

## 3. Full stack with a real API

The API is one container. It runs migrations on start, serves `/v1`, runs the payout worker and delivers webhooks. Build it from the repository root:

```bash
docker build -f apps/api/Dockerfile -t sera-payroll-api .
docker run -p 4000:4000 -e DEMO_MODE=true -e SEED_ON_START=true -e SESSION_SECRET=change-me sera-payroll-api
```

Without `DATABASE_URL` it uses an embedded PGlite database at `PGLITE_DIR` (`/data/pglite` in the image; mount a volume). With `DATABASE_URL` it uses Postgres. CI builds the image on every push so the Dockerfile cannot rot.

### Environment

The full list with defaults is in [`apps/api/.env.example`](../apps/api/.env.example). The ones that matter for hosting:

| Variable | Set it to |
|---|---|
| `WEB_ORIGIN` | The web app's origin, for CORS and cookie security. |
| `COOKIE_SAME_SITE` | `none` when the web app is on a different site from the API (GitHub Pages in front of Fly, say). Browsers then require HTTPS, which `WEB_ORIGIN` starting with `https://` turns on. `lax` when both share a site. |
| `SESSION_SECRET` | A long random string. |
| `DEMO_MODE` | `true` for a public demo (sample users, "sign in as", reset). `false` for an operator. |
| `CHAIN`, `RPC_URL`, contract addresses | From section 2. |
| `SWAP_PROVIDER` | `sera` with `SERA_API_KEY` and `SERA_API_SECRET` from Sera.cx (testnet base `https://api-testnet.sera.cx/api/v1`). `sample` plays back fixed rates. |
| `SMTP_URL`, `SMTP_FROM` | Real email. Unset keeps the outbox log only. |

### Fly.io

```bash
fly launch --no-deploy --copy-config --config deploy/fly.toml --name <your-app>
fly postgres create --name <your-app>-db
fly postgres attach <your-app>-db --app <your-app>
fly secrets set --app <your-app> SESSION_SECRET=$(openssl rand -hex 32) OPERATOR_SIGNER_PRIVATE_KEY=0x... RPC_URL=https://... PAYROLL_DISBURSER_ADDRESS=0x... PAYSLIP_REGISTRY_ADDRESS=0x...
fly deploy --app <your-app> --config deploy/fly.toml --dockerfile apps/api/Dockerfile
```

Then set `WEB_ORIGIN` to wherever the web app lives and build the web app with `VITE_API_BASE=https://<your-app>.fly.dev`.

### Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sera-cx/sera-payroll)

`render.yaml` at the repository root is a Render Blueprint with three resources: the API as a Docker web service, a Postgres database, and the web app as a static site built with `VITE_API_BASE` pointing at the API. The button above opens it in your Render account. From the dashboard the same thing is New, Blueprint, pick the repository.

Render asks for the three values marked `sync: false` before the first deploy. Service URLs are `https://<service name>.onrender.com`; Render adds a suffix if the name is taken in your account, so copy the names it shows:

| Variable | Service | Value |
|---|---|---|
| `WEB_ORIGIN` | sera-payroll-api | the static site's URL, for example `https://sera-payroll-web.onrender.com` |
| `VITE_API_BASE` | sera-payroll-web | the API's URL, for example `https://sera-payroll-api.onrender.com` |
| `VITE_SITE_URL` | sera-payroll-web | the static site's URL again, for canonicals, the sitemap and Open Graph |

`OPERATOR_SIGNER_PRIVATE_KEY` can stay empty: it is only read when `CHAIN=sepolia`.

Defaults give a hosted demo with sample data on the mock chain and sample rates. To settle through the Sepolia contracts, set `CHAIN=sepolia` on the API (the RPC and contract addresses are already in the blueprint) and give `OPERATOR_SIGNER_PRIVATE_KEY` a throwaway key with a little Sepolia ETH, since it pays gas to anchor payslips.

After the first deploy:

1. Open `https://<api>/v1/health` and expect `{"ok":true,...}`.
2. Open the static site. The demo banner shows, "Sign in as" lists the sample users, and the Network tab shows calls to the API with a `sp_session` cookie (SameSite=None, Secure).
3. The free Postgres plan expires after 30 days. Change `plan` in `render.yaml` to keep it, or accept that the demo reseeds on the next database.
4. Later pushes to `main` redeploy both services (`autoDeployTrigger: commit`).

If the static build cannot find pnpm, Render's image did not enable corepack; the build command already runs `corepack enable`, so check the build log's first lines and `NODE_VERSION`.

### Web app against a real API

```bash
cd apps/web
VITE_API_BASE=https://api.example.com VITE_SITE_URL=https://payroll.example.com VITE_CHAIN_ID=11155111 pnpm build
```

Serve `dist/` from any static host with `404.html` as the fallback for unknown paths. Leave `VITE_MOCK_API` unset. Outside demo mode the deep-link sign-in does nothing and the normal route guards apply.

## What the reference deployment covers and does not

- The GitHub Pages demo is live and rebuilds on push.
- The contracts are deployed on Sepolia (addresses above).
- The full stack is one click away on Render (button above) and needs only a Render account; nothing else is missing.
- A real Sera.cx testnet run also needs an API key from Sera.cx to poll settlement status.
