import { Link } from 'react-router-dom';
import { FAQ, REPO, ROUTES, SITE_NAME, type Group } from '../seo';

const GROUPS: Group[] = ['Employer', 'Employee', 'Operator', 'Start here'];

/**
 * The public front page. Pure markup so it can be prerendered to static HTML
 * for crawlers and shown as the first paint before the app boots.
 */
export function Landing() {
  const home = ROUTES[0]!;
  return (
    <div className="land">
      <section className="hero">
        <span className="chip">Open source · MIT · Demo on the Sepolia testnet</span>
        <h1>{home.heading}</h1>
        <p>{home.description}</p>
        <div className="btns">
          <Link className="cta" to="/employer/run">Try the employer demo</Link>
          <Link className="ghostbtn" to="/employee">See the employee view</Link>
          <a className="ghostbtn" href={REPO} target="_blank" rel="noreferrer">View on GitHub</a>
        </div>
        <p className="fine">Nothing on this site is real. The whole product runs in your browser on sample data, so you can click every button.</p>
      </section>

      <section aria-labelledby="h-how">
        <h2 id="h-how">What happens in a pay run</h2>
        <ol className="steps">
          <li><strong>Prepare</strong>Salaries, fees and one-off payments, each in the currency the person chose. Rates and routes are shown before anyone signs.</li>
          <li><strong>Fund</strong>The employer funds in one stablecoin from the treasury wallet, or in fiat through an on-ramp partner.</li>
          <li><strong>Screen</strong>Every payout address is screened before funds move. Flagged payouts are held, never silently dropped.</li>
          <li><strong>Sign</strong>The approver signs the run with the treasury wallet (EIP-712). Rates and addresses freeze at that moment. Multisig treasuries collect each signer.</li>
          <li><strong>Settle</strong>Payouts in a different stablecoin swap on Sera.cx against actual liquidity. Bank payouts go to the off-ramp partner. Nothing is custodial.</li>
          <li><strong>Prove</strong>Each payslip is sealed into a salted Merkle root and anchored on chain, so a person can prove their pay without showing the payslip.</li>
        </ol>
      </section>

      <section aria-labelledby="h-screens">
        <h2 id="h-screens">Every screen in the demo</h2>
        <p className="sub">Open any screen and the demo signs you in as the right sample user. Switch users at any time from the top bar.</p>
        {GROUPS.map((g) => {
          const items = ROUTES.filter((r) => r.group === g && r.index && r.path !== '/');
          if (!items.length) return null;
          return (
            <div key={g} className="mt">
              <h3>{g === 'Start here' ? 'Also on this site' : `${g} view`}</h3>
              <div className="cards">
                {items.map((r) => (
                  <Link key={r.path} className="card" to={r.path}>
                    <strong>{r.title}</strong>
                    <span>{r.description}</span>
                  </Link>
                ))}
                {g === 'Employer' && (
                  <Link className="card" to="/employer/run?as=approver">
                    <strong>Approve and sign as the approver</strong>
                    <span>The second pair of eyes. Review the submitted run, simulate a failed payout, then sign and send with a demo signature or your own wallet.</span>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="h-why">
        <h2 id="h-why">Why non-USD stablecoins</h2>
        <p>Most stablecoin payroll pays out in USDT or USDC and leaves the person to find an exchange. Here an employee in Malaysia receives MYRT, or ringgit by DuitNow, while the employer funds in USDT. A contractor in Indonesia receives USDT or rupiah by BI-FAST. The two choices, how the employer funds and what each person receives, are independent. Sera.cx is where those pairs settle with real liquidity.</p>
        <ul className="intro-list">
          <li><strong>Funding:</strong> USDT, USDC, MYRT, XSGD, or fiat through an on-ramp partner.</li>
          <li><strong>Wallet payouts:</strong> MYRT, XSGD, USDT, USDC, IDRT and JPYC on Ethereum.</li>
          <li><strong>Bank payouts:</strong> MYR by DuitNow, SGD by PayNow, IDR by BI-FAST, wires elsewhere, each through an off-ramp partner that holds the identity check and bank details.</li>
        </ul>
      </section>

      <section aria-labelledby="h-payslip">
        <h2 id="h-payslip">Payslips you can prove without showing</h2>
        <p>Salary data never goes on chain in the clear. Each field of a payslip is salted and hashed into a Merkle tree. The employer signs the root; the operator anchors only the root, the document hash and the pay date in the PayslipRegistry contract, next to the payout transactions. A person can hand a landlord or lender a proof of one field, such as net pay, and anyone can check it on the <Link to="/verify">verifier page</Link> or straight against the contract. Corrections bump a version and leave an event.</p>
        <p className="fine"><a href={`${REPO}/blob/main/docs/ON_CHAIN_PAYSLIP.md`} target="_blank" rel="noreferrer">Read the on-chain payslip design</a></p>
      </section>

      <section aria-labelledby="h-real">
        <h2 id="h-real">What is real here and what is simulated</h2>
        <div className="cards two">
          <div className="card pad">
            <strong>Real</strong>
            <ul className="intro-list">
              <li>The pay run engine, rounding rules, rates lock and totals</li>
              <li>Address hold, lock and screening state machines</li>
              <li>EIP-712 approval and payslip signatures and their verifying contracts</li>
              <li>The Sera.cx swap interface: intents signed exactly as the Sera.cx API returns them</li>
              <li>The API contract, webhooks, API keys and PDF payslips in the server build</li>
            </ul>
          </div>
          <div className="card pad">
            <strong>Simulated on this site</strong>
            <ul className="intro-list">
              <li>The API runs inside your browser on sample data; a refresh keeps it, a reset clears it</li>
              <li>Swaps, screening, emails, bank transfers and identity checks are played back, not performed</li>
              <li>Transaction hashes and anchors are sample values until the contracts are deployed and the server build is connected</li>
              <li>No salary, stablecoin or fiat moves anywhere</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="h-run">
        <h2 id="h-run">Run it yourself</h2>
        <p>Payroll and EOR companies fork the repository and run it under their own brand, licence and ramp partners, in the same way as the Sera.cx open-source payment gateway. No database or wallet is needed to try it locally.</p>
        <pre className="code mono">{`git clone ${REPO}.git
cd sera-payroll
pnpm install
pnpm demo        # API in demo mode with sample data
pnpm --filter @sera-payroll/web dev`}</pre>
        <p className="fine">The README lists what a fork must add before paying anyone for real: a database, email, ramp partners, statutory plug-ins, screening and a funded treasury.</p>
      </section>

      <section className="faq" aria-labelledby="h-faq">
        <h2 id="h-faq">Questions</h2>
        {FAQ.map((f) => (
          <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
        ))}
      </section>

      <footer className="land-foot">
        <span>{SITE_NAME} is open source under the MIT licence. <a href={REPO} target="_blank" rel="noreferrer">github.com/sera-cx/sera-payroll</a></span>
        <span className="pill">Settlement by Sera.cx</span>
      </footer>
    </div>
  );
}
