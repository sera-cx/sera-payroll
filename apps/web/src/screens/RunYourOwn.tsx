import { Link } from 'react-router-dom';
import { REPO } from '../seo';
import { SEPOLIA_CONTRACTS as C } from '../contracts';

const DOC = (p: string) => `${REPO}/blob/main/${p}`;

/**
 * Notes for a developer who wants to run or deploy their own copy. Pure markup
 * so it prerenders; the same facts live in README.md and docs/DEPLOY.md.
 */
export function RunYourOwn() {
  return (
    <article className="notes land">
      <header>
        <p className="chip">For developers and payroll operators</p>
        <h1>Run your own payroll on this code</h1>
        <p className="sub">The demo on this site is static. The API, the database and every adapter are played back inside your browser, which is why every button works and nothing needs a server. To pay people for real, you run the server build under your own brand, with your own database, ramp partners and licences. This page is the short version of the notes in the repository.</p>
      </header>

      <section aria-labelledby="h-local">
        <h2 id="h-local">1. Try it locally in three commands</h2>
        <p>Node 22 and pnpm 10. No database, wallet or API key is needed; the API runs on an embedded Postgres with sample data.</p>
        <pre className="code mono">{`git clone ${REPO}.git && cd sera-payroll
pnpm install
pnpm demo                              # API in demo mode on http://localhost:4000/v1
pnpm --filter @sera-payroll/web dev    # web app on http://localhost:5173`}</pre>
        <p className="fine">To run the web app exactly like this site, with no API at all: <code>VITE_MOCK_API=1 pnpm --filter @sera-payroll/web dev</code>.</p>
      </section>

      <section aria-labelledby="h-server">
        <h2 id="h-server">2. What the server build adds</h2>
        <ul className="intro-list">
          <li><strong>Postgres</strong> with migrations, or the embedded PGlite for a single-box demo.</li>
          <li><strong>Sessions and roles</strong> enforced on the server: magic links, Sign-In with Ethereum, API keys, client scoping.</li>
          <li><strong>The payout worker:</strong> screening, swap, wallet or off-ramp delivery, idempotent retries, and payslip anchoring on chain.</li>
          <li><strong>Webhooks</strong> signed with HMAC, a delivery log, and <strong>PDF payslips</strong>.</li>
          <li><strong>Real wallet signing:</strong> EIP-712 approval of a pay run, Sera.cx swap intents signed in the browser, the batched disbursement from the treasury wallet.</li>
          <li><strong>Email</strong> through SMTP; without it the outbox is the log, as on this site.</li>
        </ul>
        <p>Everything outside the core sits behind an interface: <code>SwapProvider</code> (Sera.cx), <code>RampAdapter</code>, <code>ScreeningProvider</code>, <code>StatutoryPlugin</code>, <code>Notifier</code> and <code>ChainAdapter</code>. Mock implementations ship for each.</p>
      </section>

      <section aria-labelledby="h-deploy">
        <h2 id="h-deploy">3. Deploy the server build</h2>
        <p>The API is one container. It runs migrations on start, serves <code>/v1</code>, runs the worker and delivers webhooks. The web app is a static build that you point at the API with <code>VITE_API_BASE</code>.</p>
        <h3>One click on Render</h3>
        <p><a href="https://render.com/deploy?repo=https://github.com/sera-cx/sera-payroll" target="_blank" rel="noreferrer"><img alt="Deploy to Render" src="https://render.com/images/deploy-to-render-button.svg" height="36" /></a></p>
        <p>The blueprint at <code>render.yaml</code> creates the API, a Postgres database and the static site. Render asks for three URLs during setup; the <a href={DOC('docs/DEPLOY.md')} target="_blank" rel="noreferrer">deployment guide</a> lists them and what to check after the first deploy.</p>
        <h3>Any Docker host</h3>
        <pre className="code mono">{`docker build -f apps/api/Dockerfile -t sera-payroll-api .
docker run -p 4000:4000 \\
  -e DATABASE_URL=postgres://... -e SESSION_SECRET=$(openssl rand -hex 32) \\
  -e WEB_ORIGIN=https://payroll.example.com -e COOKIE_SAME_SITE=none \\
  sera-payroll-api`}</pre>
        <p className="fine">A Fly.io config is in <code>deploy/fly.toml</code>. CI builds and boots the image on every push, so the Dockerfile stays honest.</p>
        <h3>The environment that matters</h3>
        <table className="vt">
          <thead><tr><th>Variable</th><th>What to set</th></tr></thead>
          <tbody>
            <tr><td><code>DEMO_MODE</code></td><td><code>true</code> for a public demo with sample users and the permanent banner; <code>false</code> for an operator.</td></tr>
            <tr><td><code>WEB_ORIGIN</code>, <code>COOKIE_SAME_SITE</code></td><td>The web app's origin. <code>none</code> when the web app is on a different site from the API, which then needs HTTPS.</td></tr>
            <tr><td><code>CHAIN</code>, <code>RPC_URL</code></td><td><code>sepolia</code> or <code>ethereum</code> with a JSON-RPC endpoint; <code>mock</code> keeps everything off chain.</td></tr>
            <tr><td><code>PAYROLL_DISBURSER_ADDRESS</code>, <code>PAYSLIP_REGISTRY_ADDRESS</code></td><td>The contracts below on Sepolia, or your own deployment.</td></tr>
            <tr><td><code>OPERATOR_SIGNER_PRIVATE_KEY</code></td><td>Signs payslip roots and pays gas to anchor them. Never holds funds.</td></tr>
            <tr><td><code>SWAP_PROVIDER</code>, <code>SERA_API_KEY</code>, <code>SERA_API_SECRET</code></td><td><code>sera</code> with keys from Sera.cx (testnet base <code>https://api-testnet.sera.cx/api/v1</code>); <code>sample</code> plays back fixed rates.</td></tr>
            <tr><td><code>SMTP_URL</code>, <code>SMTP_FROM</code></td><td>Real email. Unset keeps the outbox only.</td></tr>
          </tbody>
        </table>
        <p className="fine">The full list with defaults is in <a href={DOC('apps/api/.env.example')} target="_blank" rel="noreferrer">apps/api/.env.example</a>.</p>
      </section>

      <section aria-labelledby="h-chain">
        <h2 id="h-chain">4. Contracts</h2>
        <p>Two settlement contracts and two demo stablecoins are deployed on Sepolia, verified on Sourcify. Point the API at them, or deploy your own with Foundry.</p>
        <table className="vt">
          <thead><tr><th>Contract</th><th>Address on Sepolia</th></tr></thead>
          <tbody>
            <tr><td>PayrollDisburser</td><td><a className="mono addr" href={`${C.explorer}/address/${C.PayrollDisburser}`} target="_blank" rel="noreferrer">{C.PayrollDisburser}</a></td></tr>
            <tr><td>PayslipRegistry</td><td><a className="mono addr" href={`${C.explorer}/address/${C.PayslipRegistry}`} target="_blank" rel="noreferrer">{C.PayslipRegistry}</a></td></tr>
            <tr><td>tUSDT faucet</td><td><a className="mono addr" href={`${C.explorer}/address/${C.tUSDT}`} target="_blank" rel="noreferrer">{C.tUSDT}</a></td></tr>
            <tr><td>tMYRT faucet</td><td><a className="mono addr" href={`${C.explorer}/address/${C.tMYRT}`} target="_blank" rel="noreferrer">{C.tMYRT}</a></td></tr>
          </tbody>
        </table>
        <pre className="code mono">{`cd contracts && forge test
forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast --skip-simulation --slow`}</pre>
        <p className="fine"><code>--skip-simulation</code> matters: current Sepolia charges several times Foundry's local estimate for contract creation. Only the two settlement contracts are meant for mainnet. Treasury wallets must approve the disburser on each stablecoin they pay with; the web app offers that step before signing.</p>
      </section>

      <section aria-labelledby="h-fork">
        <h2 id="h-fork">5. Before paying anyone for real</h2>
        <ol className="intro-list">
          <li><strong>A database and an email provider.</strong> Postgres is wired; implement <code>Notifier</code> for your email service.</li>
          <li><strong>Ramp partner adapters.</strong> One <code>RampAdapter</code> per licensed partner and currency: deposit instructions, funds confirmation, hosted identity checks, bank payout creation and status.</li>
          <li><strong>Screening.</strong> A real <code>ScreeningProvider</code>, run before every payout. The default is a pattern rule with an optional Chainalysis check.</li>
          <li><strong>Statutory plug-ins.</strong> One <code>StatutoryPlugin</code> per country with real rules. The sample is a flat percentage.</li>
          <li><strong>Accounts and SSO.</strong> Connect your identity provider and existing user base.</li>
          <li><strong>Licences.</strong> Moving salaries and handling fiat are regulated. You and your ramp partners carry them.</li>
          <li><strong>Your brand.</strong> Replace the <code>[YOUR PAYROLL BRAND]</code> placeholders. "Settlement by Sera.cx" stays as the only Sera.cx mark, and any public demo keeps the permanent demo banner.</li>
        </ol>
      </section>

      <section aria-labelledby="h-docs">
        <h2 id="h-docs">Where the notes are</h2>
        <ul className="intro-list">
          <li><a href={DOC('README.md')} target="_blank" rel="noreferrer">README</a>: what it is, quick start, rules the code keeps, risks.</li>
          <li><a href={DOC('docs/DEPLOY.md')} target="_blank" rel="noreferrer">docs/DEPLOY.md</a>: GitHub Pages demo, contracts, full stack on Render, Fly or Docker, search engine notes.</li>
          <li><a href={DOC('docs/BUILD_NOTES.md')} target="_blank" rel="noreferrer">docs/BUILD_NOTES.md</a>: the design, in eighteen sections. Also summarised on <Link to="/build-notes">the build notes page</Link>.</li>
          <li><a href={DOC('docs/API.md')} target="_blank" rel="noreferrer">docs/API.md</a>: the HTTP contract, webhooks and API keys.</li>
          <li><a href={DOC('docs/ON_CHAIN_PAYSLIP.md')} target="_blank" rel="noreferrer">docs/ON_CHAIN_PAYSLIP.md</a>: the payslip commitment scheme behind <Link to="/verify">the verifier</Link>.</li>
          <li><a href={DOC('contracts/script/README.md')} target="_blank" rel="noreferrer">contracts/script/README.md</a>: deploying and verifying the contracts.</li>
        </ul>
        <p className="fine">Licensed under the <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">Sera.cx Payroll Source Licence</a>: free to fork, rebrand and sell; settlement in production goes through the Sera.cx Protocol and that condition cannot be removed. <a href={REPO} target="_blank" rel="noreferrer">github.com/sera-cx/sera-payroll</a></p>
      </section>
    </article>
  );
}
