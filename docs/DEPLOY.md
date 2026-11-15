# Deploying Sera.cx Payroll

Three things can be deployed, independently:

| Piece | What it is | Where the reference deployment lives |
|---|---|---|
| **Public demo** | The web app built in mock mode. The whole product runs in the visitor's browser on sample data. No server. | GitHub Pages: https://sera-cx.github.io/sera-payroll/ |
| **Contracts** | `PayrollDisburser`, `PayslipRegistry` and two demo stablecoins on Sepolia. | `contracts/deployments/sepolia.json` once deployed |
| **Full stack** | The API with Postgres, the payout worker, webhooks, PDF payslips and real wallet signing, plus the web app pointed at it. | Any Docker host. Fly.io and Render configs are in `deploy/`. |

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
- Titles are `<screen> · Sera.cx Payroll demo`; the landing page is `Sera.cx Payroll: open-source stablecoin payroll`. Change `SITE_NAME` and the route table in `apps/web/src/seo.ts` when you rebrand.
- After the first deploy, submit `https://<site>/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Both need you to verify ownership of the GitHub Pages site (an HTML file in `apps/web/public/` works).

## 2. Contracts on Sepolia

Three contracts, all permissionless and holding no funds. Details in [`contracts/script/README.md`](../contracts/script/README.md).

### From your machine

```bash
cd contracts
cp .env.example .env    # or create it: PRIVATE_KEY, SEPOLIA_RPC_URL, DEPLOY_TEST_TOKENS
forge build && forge test
forge script script/Deploy.s.sol:Deploy --rpc-url "$SEPOLIA_RPC_URL" --broadcast -vv
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
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PAYROLL_DISBURSER_ADDRESS=0x...
PAYSLIP_REGISTRY_ADDRESS=0x...
OPERATOR_SIGNER_PRIVATE_KEY=0x...   # signs payslip roots and relays anchors; also a throwaway on testnet
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

`deploy/render.yaml` is a blueprint with the API (Docker), a Postgres database and the web app as a static site that is built with `VITE_API_BASE` pointing at the API. In Render choose New, Blueprint, pick the repository, and fill in the secrets it asks for.

### Web app against a real API

```bash
cd apps/web
VITE_API_BASE=https://api.example.com VITE_SITE_URL=https://payroll.example.com VITE_CHAIN_ID=11155111 pnpm build
```

Serve `dist/` from any static host with `404.html` as the fallback for unknown paths. Leave `VITE_MOCK_API` unset. Outside demo mode the deep-link sign-in does nothing and the normal route guards apply.

## What the reference deployment covers and does not

- The GitHub Pages demo is live and rebuilds on push.
- The contracts and the full stack are ready to deploy but need a funded Sepolia key and a hosting account. The steps above are exact; nothing else is missing.
- A real Sera.cx testnet run also needs an API key from Sera.cx to poll settlement status.
