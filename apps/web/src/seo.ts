/**
 * One table of every page in the app: its path, title, description and which
 * sample user the demo signs in as when the page is opened directly. The live
 * app, the prerendered HTML, the sitemap and the landing page all read it, so
 * a new screen only needs a row here to be linked, indexed and described.
 */
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/$/, '');
export const SITE_NAME = 'Sera.cx Payroll';
export const TAGLINE = 'Source-available stablecoin payroll. Settlement by Sera.cx.';
export const REPO = 'https://github.com/sera-cx/sera-payroll';

export type DemoRole = 'preparer' | 'approver' | 'employee' | 'operator_admin';
export type Group = 'Start here' | 'Employer' | 'Employee' | 'Operator';

export interface RouteMeta {
  path: string;
  /** Short title used in the browser tab and on landing page cards. */
  title: string;
  /** The h1 of the prerendered page. */
  heading: string;
  description: string;
  group: Group;
  /** Sample user the demo signs in as when the page is opened directly. */
  as?: DemoRole;
  /** Listed in the sitemap and allowed in search results. */
  index: boolean;
  /** What a visitor can do on the page. Shown to crawlers and on the landing page. */
  points: string[];
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/', title: 'Source-available stablecoin payroll', group: 'Start here', index: true,
    heading: 'Stablecoin payroll where each person chooses what they receive',
    description: 'Employers fund a pay run in USDT, USDC, MYRT, XSGD or fiat. Each employee or contractor receives any supported stablecoin to their wallet, or fiat to their bank. Free to fork under the Sera.cx Payroll Source Licence; settlement by Sera.cx.',
    points: [],
  },
  {
    path: '/run-your-own', title: 'Run your own', group: 'Start here', index: true,
    heading: 'Run your own payroll on this code',
    description: 'How a developer or payroll operator runs Sera.cx Payroll locally in three commands, deploys the server build with Docker or one click on Render, points it at the Sepolia contracts, and what a fork must add before paying anyone for real.',
    points: ['Local demo in three commands, no database or wallet', 'Docker image, Render blueprint and Fly config for the API', 'The environment variables that matter and the deployed contract addresses', 'The seven things a fork adds before going live'],
  },
  {
    path: '/verify', title: 'Verify a payslip proof', group: 'Start here', index: true,
    heading: 'Verify a payslip proof',
    description: 'Check a selective-disclosure payslip proof against its Merkle root and the on-chain PayslipRegistry record, without seeing the rest of the payslip.',
    points: ['Paste the proof bundle an employee shared with you', 'Each disclosed field is checked against the payslip root in your browser', 'When the payslip is anchored, the root is compared with the PayslipRegistry contract on chain'],
  },
  {
    path: '/build-notes', title: 'Build notes', group: 'Start here', index: true,
    heading: 'Build notes',
    description: 'The design notes behind Sera.cx Payroll: roles, rules and formulas, state machines, data model, interfaces, security requirements, brand rules and the build order.',
    points: ['Eighteen sections, kept in the repository next to the code', 'The API contract and the on-chain payslip design', 'What a fork must add before going live'],
  },
  {
    path: '/sign-in', title: 'Sign in', group: 'Start here', index: true,
    heading: 'Sign in',
    description: 'Sign in to Sera.cx Payroll with an emailed link or a wallet. The public demo signs you in as a sample user instead.',
    points: ['Magic link by email', 'Sign-In with Ethereum for treasury signers', 'In the demo, pick a sample user from the top bar'],
  },
  {
    path: '/employer/run', title: 'Pay run', group: 'Employer', as: 'preparer', index: true,
    heading: 'Prepare, fund and sign a pay run',
    description: 'The employer pay run: salaries and one-off payments in each person\'s chosen stablecoin or bank currency, funding in one stablecoin, screening, two-person approval and an EIP-712 signature from the treasury wallet.',
    points: ['See every payout, its route through Sera.cx and the locked rate', 'Add one-off payments, skip people, pick the funding stablecoin', 'Fund by wallet balance or by bank through the on-ramp partner', 'Submit for approval, then sign and send as the approver'],
  },
  {
    path: '/employer/staff', title: 'Employees and contractors', group: 'Employer', as: 'preparer', index: true,
    heading: 'Employees, contractors and their payout addresses',
    description: 'Add people one at a time or import a pay file, invite them to choose how they are paid, and manage wallet addresses with a 48 hour hold on changes, address locks and test payments.',
    points: ['Import a CSV pay file with duplicate detection', 'Invite each person to set up their own payout', 'Address changes wait 48 hours and can be locked', 'Send a small test payment before the first salary'],
  },
  {
    path: '/employer/history', title: 'History and tracking', group: 'Employer', as: 'preparer', index: true,
    heading: 'Pay run history and payout tracking',
    description: 'Every sent pay run with each payout\'s stages, transaction hashes, retries, the accounting export and the payslips anchored on chain.',
    points: ['Follow each payout from screening to arrival', 'Retry a failed payout without paying anyone twice', 'Download the accounting CSV and PDF payslips', 'Open the on-chain payslip record for each person'],
  },
  {
    path: '/employer/outbox', title: 'Outbox', group: 'Employer', as: 'preparer', index: true,
    heading: 'Emails the app would send',
    description: 'Invites, approval requests, payslip notices and address alerts, shown as an outbox so you can see what each person receives.',
    points: ['Every email the pay run produced', 'Who it went to and why', 'In the demo nothing is sent'],
  },
  {
    path: '/employer/settings', title: 'Client settings', group: 'Employer', as: 'approver', index: true,
    heading: 'Client settings',
    description: 'Treasury wallet, multisig threshold, two-person approval, funding stablecoin, fee and the address hold period for one employer.',
    points: ['Treasury wallet and multisig signers', 'Two-person approval on or off', 'Default funding stablecoin and operator fee'],
  },
  {
    path: '/employee', title: 'Employee view', group: 'Employee', as: 'employee', index: true,
    heading: 'How do you want to be paid?',
    description: 'The employee and contractor view: choose a stablecoin or your bank, split between the two, set and sign your wallet address, and read payslips you can prove on chain.',
    points: ['Pick MYRT, XSGD, USDT, USDC, IDRT or JPYC, or your bank', 'Split salary between a wallet and a bank account', 'Sign your own address with your wallet', 'Download a payslip or share a proof of one field'],
  },
  {
    path: '/operator/clients', title: 'Operator: clients', group: 'Operator', as: 'operator_admin', index: true,
    heading: 'Operator console: clients',
    description: 'The payroll operator\'s console: every client, its fee, people and treasury wallet, with the ability to work as any client.',
    points: ['Add a client and set its fee', 'Open any client\'s employer view', 'See treasury wallets at a glance'],
  },
  {
    path: '/operator/ramps', title: 'Operator: ramp partners', group: 'Operator', as: 'operator_admin', index: true,
    heading: 'On-ramp and off-ramp partners',
    description: 'Which fiat currencies can come in and go out, and through which partner. Bank details and identity checks stay with the partner.',
    points: ['One partner per currency for fiat in and fiat out', 'DuitNow, PayNow, BI-FAST and wire', 'Turn a currency off and the employee option disappears'],
  },
  {
    path: '/operator/plugins', title: 'Operator: statutory plug-ins', group: 'Operator', as: 'operator_admin', index: true,
    heading: 'Statutory deduction plug-ins',
    description: 'Country plug-ins that compute statutory deductions per person before the net is paid. The demo ships sample rates only.',
    points: ['Enable a plug-in per currency and country', 'Deductions appear on payslips and in the accounting export', 'Real rates come from the fork\'s own plug-in'],
  },
  {
    path: '/operator/api', title: 'Operator: API and webhooks', group: 'Operator', as: 'operator_admin', index: true,
    heading: 'API keys and webhooks',
    description: 'Create API keys for your own systems and register webhooks for pay run and payout events, signed with HMAC.',
    points: ['API keys shown once, revocable', 'Webhooks for run.sent, payout.arrived, payout.failed and more', 'Delivery log with response codes'],
  },
  {
    path: '/invite', title: 'Accept an invite', group: 'Employee', index: false,
    heading: 'You are invited to set up how you get paid',
    description: 'An employee or contractor accepts an invite from their employer and chooses how they are paid.',
    points: [],
  },
];

export function metaFor(pathname: string): RouteMeta {
  const p = pathname.replace(/\/+$/, '') || '/';
  const exact = ROUTES.find((r) => r.path === p);
  if (exact) return exact;
  const prefix = ROUTES.filter((r) => r.path !== '/' && p.startsWith(r.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];
  if (prefix) return prefix;
  if (p === '/employer') return ROUTES.find((r) => r.path === '/employer/run')!;
  if (p === '/operator') return ROUTES.find((r) => r.path === '/operator/clients')!;
  return ROUTES[0]!;
}

/** Canonical URL. Prerendered pages live in folders, so paths end with a slash. */
export function canonicalUrl(path: string): string {
  const p = path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`;
  return SITE_URL ? `${SITE_URL}${p}` : p;
}

export const pageTitle = (m: RouteMeta) => (m.path === '/' ? `${SITE_NAME}: ${m.title}` : `${m.title} · ${SITE_NAME} demo`);

export const FAQ: { q: string; a: string }[] = [
  { q: 'Is this a real payroll service?', a: 'No. This is the source-available reference build and a public demo. Everything on it runs on sample data and a testnet. Payroll operators fork the repository and run it under their own brand, licence and partners.' },
  { q: 'What does Sera.cx do here?', a: 'Sera.cx is the stablecoin-to-stablecoin swap in the middle of a pay run, settled against actual liquidity with EIP-712 intents. It never holds funds or keys and does not run payroll for anyone. The mark on every screen is "Settlement by Sera.cx".' },
  { q: 'Which stablecoins and currencies are supported?', a: 'Funding in USDT, USDC, MYRT or XSGD, or in fiat through an on-ramp partner. Payouts in MYRT, XSGD, USDT, USDC, IDRT or JPYC on Ethereum, or in MYR, SGD and IDR to a bank through an off-ramp partner.' },
  { q: 'Do bank details or identity documents touch the app?', a: 'No. Off-ramp partners hold identity checks and bank details. The app only learns whether a person is verified and which currency they can receive.' },
  { q: 'What is an on-chain payslip?', a: 'Each payslip is sealed into a salted Merkle root signed by the employer and anchored in the PayslipRegistry contract next to the payout transactions. Salary data never goes on chain in the clear. An employee can prove one field, such as net pay, to a landlord or lender, who verifies it on this site or against the contract.' },
  { q: 'Are the contracts deployed?', a: 'Yes, on the Sepolia testnet: PayrollDisburser for batched payouts and PayslipRegistry for payslip anchors, plus two demo stablecoins with faucets. The addresses are on this page and in the repository, and a sample payroll run has been paid and its payslip anchored through them. Mainnet deployment is for operators, with only the two settlement contracts.' },
  { q: 'What does the licence require?', a: 'The Sera.cx Payroll Source Licence lets you use, change, rebrand, sell and redistribute the software free of charge. In production, every stablecoin-to-stablecoin exchange must go through the Sera.cx Protocol and the Settlement by Sera.cx mark stays in place; removing or bypassing that ends the licence immediately and permanently. Testnets, local development, demos on sample data, bank payouts and payouts that need no exchange are not restricted. The smart contracts are MIT.' },
  { q: 'Can I run it myself?', a: 'Yes. Clone the repository, run pnpm install and pnpm demo, and open the web app. No database or wallet is needed for the demo. The README lists what a fork must add before paying anyone for real.' },
];

export interface HeadModel { title: string; meta: ({ name: string; content: string } | { property: string; content: string })[]; links: { rel: string; href: string }[]; jsonLd: object[] }

export function headModel(m: RouteMeta, opts: { noindex?: boolean } = {}): HeadModel {
  const url = canonicalUrl(m.path);
  const image = SITE_URL ? `${SITE_URL}/og.png` : '/og.png';
  const title = pageTitle(m);
  const index = m.index && !opts.noindex;
  const jsonLd: object[] = [];
  if (m.path === '/') {
    jsonLd.push(
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: url, description: m.description },
      { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: SITE_NAME, codeRepository: REPO, programmingLanguage: ['TypeScript', 'Solidity'], license: `${REPO}/blob/main/LICENSE`, description: TAGLINE, runtimePlatform: 'Node.js 22', url },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    );
  } else {
    jsonLd.push({
      '@context': 'https://schema.org', '@type': 'WebPage', name: title, url, description: m.description, isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: canonicalUrl('/') },
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: canonicalUrl('/') },
        ...(m.group === 'Start here' ? [] : [{ '@type': 'ListItem', position: 2, name: m.group, item: canonicalUrl(m.group === 'Employer' ? '/employer/run' : m.group === 'Employee' ? '/employee' : '/operator/clients') }]),
        { '@type': 'ListItem', position: m.group === 'Start here' ? 2 : 3, name: m.title, item: url },
      ],
    });
  }
  return {
    title,
    meta: [
      { name: 'description', content: m.description },
      { name: 'robots', content: index ? 'index,follow,max-image-preview:large' : 'noindex,nofollow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: title },
      { property: 'og:description', content: m.description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: `${SITE_NAME}: ${TAGLINE}` },
      { property: 'og:locale', content: 'en_GB' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: m.description },
      { name: 'twitter:image', content: image },
    ],
    links: [{ rel: 'canonical', href: url }],
    jsonLd,
  };
}
