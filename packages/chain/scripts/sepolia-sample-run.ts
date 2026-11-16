/**
 * Pay one sample payroll run on Sepolia and anchor one payslip, using the same
 * core and chain code the API uses. Produces the proof bundle the public demo
 * offers on its verifier page, and a record of the run for the repository.
 *
 *   pnpm exec tsx packages/chain/scripts/sepolia-sample-run.ts
 *
 * Reads PRIVATE_KEY and SEPOLIA_RPC_URL from contracts/.env (or the environment).
 * The key is the owner of the demo stablecoins and acts as the employer's treasury
 * and signer. Nothing here is real money: both stablecoins are the repository's
 * TestStablecoin faucets. Re-running is safe: the disburser skips legs it has
 * paid and the registry records a correction when the root changes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createPublicClient, createWalletClient, encodeFunctionData, formatUnits, getAddress, http, parseUnits, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { SAMPLE_CLIENTS, SAMPLE_RATES, disclose, sealPayslip, type PayslipDocument } from '@sera-payroll/core';
import { createChainAdapter, payslipTypedData } from '../src/index.js';
import { TestStablecoinAbi, erc20Abi } from '../src/abi/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

// --- environment (never printed) ------------------------------------------------
const env: Record<string, string> = { ...process.env } as Record<string, string>;
try {
  for (const line of readFileSync(resolve(repo, 'contracts/.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1]! in process.env)) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch { /* rely on the environment */ }
const pk = env.PRIVATE_KEY as Hex | undefined;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('PRIVATE_KEY missing. Put the deployer key in contracts/.env (gitignored).');
const rpcUrl = env.SEPOLIA_RPC_URL || 'https://sepolia.gateway.tenderly.co';

// --- deployment -------------------------------------------------------------------
const dep = JSON.parse(readFileSync(resolve(repo, 'contracts/deployments/sepolia.json'), 'utf8')) as {
  chainId: number; explorer: string; PayrollDisburser: Address; PayslipRegistry: Address; TestStablecoin: { tUSDT: Address; tMYRT: Address };
};
const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
const chain = createChainAdapter({
  network: 'sepolia', rpcUrl, disburserAddress: dep.PayrollDisburser, payslipRegistryAddress: dep.PayslipRegistry,
  tokens: { USDT: { address: dep.TestStablecoin.tUSDT, decimals: 6 }, MYRT: { address: dep.TestStablecoin.tMYRT, decimals: 6 } },
  client: publicClient,
});
const signer = {
  address: account.address,
  signTypedData: (args: Parameters<typeof account.signTypedData>[0]) => account.signTypedData(args),
  sendTransaction: (tx: { to: Address; data: Hex; value?: bigint }) => wallet.sendTransaction({ ...tx, account, chain: sepolia }),
};
async function send(label: string, tx: { to: Address; data: Hex }) {
  const hash = await signer.sendTransaction(tx);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label} reverted in ${hash}`);
  console.log(`${label}: ${dep.explorer}/tx/${hash}`);
  return hash;
}

// --- the sample run ----------------------------------------------------------------
// Sample Studio Sdn Bhd, October 2026. Two legs settle on chain: Aisyah's salary in
// MYRT and the 30% of Nurul's salary she takes in USDT. The rest of the sample
// company is paid by bank off-ramp in the demo and has no on-chain leg.
const studio = SAMPLE_CLIENTS[0]!;
const aisyah = studio.people.find((p) => p.id === 'p1')!;
const nurul = studio.people.find((p) => p.id === 'p3')!;
const payday = '2026-10-28';
const runId = env.SAMPLE_RUN_ID || `sample-${studio.id}-2026-10`;
const runLabel = 'October 2026 payroll';
const myrPerUsd = Number(SAMPLE_RATES.MYR);
const fixed = (n: number, dp = 2) => n.toFixed(dp);

const aisyahNet = Number(aisyah.monthlyPay); // MYR, no deduction in the sample
const nurulUsdt = (Number(nurul.monthlyPay) * (1 - nurul.splitPercent / 100)) / myrPerUsd; // 30% of 6000 MYR in USDT
const legs = [
  { payoutId: `${runId}-${aisyah.id}`, stablecoin: 'MYRT' as const, to: aisyah.wallet.address!.toLowerCase() as Address, amount: fixed(aisyahNet) },
  { payoutId: `${runId}-${nurul.id}`, stablecoin: 'USDT' as const, to: nurul.wallet.address!.toLowerCase() as Address, amount: fixed(nurulUsdt) },
];

console.log(`Treasury and employer signer: ${account.address}`);
console.log(`Run ${runId}, payday ${payday}, ${legs.length} on-chain legs`);

// 1. Mint what the run needs to the treasury and approve the disburser.
for (const leg of legs) {
  const token = chain.tokenInfo(leg.stablecoin);
  const raw = parseUnits(leg.amount, token.decimals);
  const bal = await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  if (bal < raw) await send(`Mint ${leg.amount} t${leg.stablecoin} to the treasury`, { to: token.address, data: encodeMint(account.address, raw - bal) });
  const allowance = await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'allowance', args: [account.address, dep.PayrollDisburser] });
  if (allowance < raw) await send(`Approve PayrollDisburser for ${leg.amount} t${leg.stablecoin}`, { to: token.address, data: encodeApprove(dep.PayrollDisburser, raw) });
}

// 2. Pay the run in one batched transaction.
const paid = await chain.disburse(runId, legs, signer);
console.log(`Disburse: ${chain.explorerTxUrl(paid.txHash)}`);
for (const l of paid.legs) console.log(`  ${l.payoutId}: ${l.ok ? 'paid' : 'FAILED'}${l.reason ? ` (${l.reason})` : ''}`);
if (!paid.legs.every((l) => l.ok)) throw new Error('A leg failed; stopping before the payslip.');

// 3. Seal Aisyah's payslip, sign it as the employer and anchor it.
const doc: PayslipDocument = {
  version: 1, runId, runLabel, payday, employer: getAddress(account.address), employerName: studio.name,
  personId: aisyah.id, personName: aisyah.name, personType: aisyah.type, kind: 'Salary', currency: aisyah.currency,
  gross: fixed(aisyahNet), deduction: '0.00', net: fixed(aisyahNet),
  payouts: [{ option: 'MYRT', amount: fixed(aisyahNet), lockedRate: '1.0000', usdValue: fixed(aisyahNet / myrPerUsd), txHash: paid.txHash, address: getAddress(aisyah.wallet.address!), network: 'sepolia' }],
};
const sealed = sealPayslip(doc, () => toHex(randomBytes(32)));
const typed = payslipTypedData({ chainId: dep.chainId, registry: dep.PayslipRegistry, runId, personId: aisyah.id, payday: new Date(`${payday}T00:00:00Z`), root: sealed.root, docHash: sealed.docHash });
const employerSignature = await account.signTypedData(typed);
const anchored = await chain.anchorPayslip({ runId, personId: aisyah.id, payday: new Date(`${payday}T00:00:00Z`), root: sealed.root, docHash: sealed.docHash, employerSignature }, signer);
console.log(`Anchor: ${chain.explorerTxUrl(anchored.txHash)} (anchorId ${anchored.anchorId})`);

// 4. A disclosure for a landlord: net pay, currency, pay date, employer, payout transaction.
const d = disclose(sealed, ['net', 'currency', 'payday', 'employerName', 'payout.0.txHash']);
const bundle = {
  ...d, anchorTx: anchored.txHash, explorerUrl: chain.explorerTxUrl(anchored.txHash), chainId: dep.chainId, registry: dep.PayslipRegistry,
  anchorId: anchored.anchorId, runId, personId: aisyah.id, payday,
};
const webData = resolve(repo, 'apps/web/src/data');
mkdirSync(webData, { recursive: true });
writeFileSync(resolve(webData, 'sepolia-sample-proof.json'), JSON.stringify(bundle, null, 2) + '\n');

const record = {
  network: 'sepolia', chainId: dep.chainId, runId, runLabel, payday, employer: getAddress(account.address), employerName: studio.name,
  disburseTx: paid.txHash, anchorTx: anchored.txHash, anchorId: anchored.anchorId, root: sealed.root, docHash: sealed.docHash,
  legs: legs.map((l, i) => ({ ...l, to: getAddress(l.to), ok: paid.legs[i]!.ok, reason: paid.legs[i]!.reason })),
  payslipFor: { personId: aisyah.id, personName: aisyah.name },
  disclosedFields: d.fields.map((f) => f.leaf.name),
  explorer: dep.explorer, ranAt: Math.floor(Date.now() / 1000),
  notes: 'Paid with the repository demo stablecoins (TestStablecoin faucets) from packages/chain/scripts/sepolia-sample-run.ts. The proof bundle for the verifier page is apps/web/src/data/sepolia-sample-proof.json. Undisclosed salts stay with the operator.',
};
writeFileSync(resolve(repo, 'contracts/deployments/sepolia-sample-run.json'), JSON.stringify(record, null, 2) + '\n');
const priv = env.SAMPLE_RUN_PRIVATE_OUT;
if (priv) { mkdirSync(dirname(priv), { recursive: true }); writeFileSync(priv, JSON.stringify({ doc: sealed.doc, leaves: sealed.leaves, root: sealed.root, docHash: sealed.docHash, employerSignature }, null, 2) + '\n'); }

const balances = await chain.balances(account.address, ['USDT', 'MYRT']);
console.log('Treasury after the run:', balances.map((b) => `${b.balance} t${b.stablecoin}`).join(', '));
console.log(`Gas left: ${formatUnits(await publicClient.getBalance({ address: account.address }), 18)} ETH`);
console.log('Wrote apps/web/src/data/sepolia-sample-proof.json and contracts/deployments/sepolia-sample-run.json');

function encodeMint(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: TestStablecoinAbi, functionName: 'mint', args: [to, amount] });
}
function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
}
