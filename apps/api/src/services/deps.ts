import { createWalletClient, http, type Address, type Hex } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { fakeTxHash } from '../ids.js';
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import type { ChainAdapter, Fiat, RampAdapter, ScreeningProvider, SwapProvider } from '@sera-payroll/core';
import { FIAT } from '@sera-payroll/core';
import type { Db, DbHandle } from '@sera-payroll/db';
import { clients } from '@sera-payroll/db';
import { eq } from 'drizzle-orm';
import type { Config } from '../config.js';
import { createChainAdapter } from '../adapters/chain.js';
import { MockRampAdapter } from '../adapters/mock-ramp.js';
import { OutboxNotifier, SmtpNotifier, type AppNotifier } from '../adapters/notifier.js';
import { SampleRateSwapProvider } from '../adapters/sample-swap.js';
import { ChainalysisSanctionsScreening, patternScreening } from '../adapters/screening.js';
import { SeraSwapProvider } from '../adapters/sera-swap.js';
import { WebhookService } from './webhooks.js';

export interface Deps {
  config: Config;
  db: Db;
  handle: DbHandle;
  swap: SwapProvider;
  sera: SeraSwapProvider | null;
  ramps: Record<Fiat, RampAdapter>;
  screening: ScreeningProvider;
  notifier: AppNotifier;
  chain: ChainAdapter;
  /** Operator signer: signs payslip roots and pays gas for anchors. */
  signer: PrivateKeyAccount;
  /** Sends relayed transactions (payslip anchors) from the operator signer. Fake hashes on the mock chain. */
  relay: { sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex> };
  webhooks: WebhookService;
  now: () => Date;
}

export async function createDeps(config: Config, handle: DbHandle, overrides: Partial<Deps> = {}): Promise<Deps> {
  const db = handle.db;
  const readDemoBalances = async (owner: Address): Promise<Record<string, string>> => {
    // Mock chain: the "owner" is the client id in disguise (see runs.ts balancesFor).
    const c = await db.select({ balances: clients.balances }).from(clients).where(eq(clients.id, owner as string)).limit(1);
    return c[0]?.balances ?? {};
  };
  const sera = config.SWAP_PROVIDER === 'sera' ? new SeraSwapProvider({ baseUrl: config.SERA_API_BASE, apiKey: config.SERA_API_KEY, apiSecret: config.SERA_API_SECRET }) : null;
  const key = config.OPERATOR_SIGNER_PRIVATE_KEY ?? (config.DEMO_MODE ? generatePrivateKey() : null);
  if (!key) throw new Error('OPERATOR_SIGNER_PRIVATE_KEY is required outside DEMO_MODE.');
  const signer = privateKeyToAccount(key as `0x${string}`);
  if (!config.OPERATOR_SIGNER_PRIVATE_KEY && config.DEMO_MODE) console.log(`[demo] operator signer ${signer.address} (throwaway key for this process)`);
  const ramps = Object.fromEntries(FIAT.map((c) => [c, new MockRampAdapter(c)])) as unknown as Record<Fiat, RampAdapter>;
  const relay = config.CHAIN === 'mock'
    ? { sendTransaction: async () => fakeTxHash() as Hex }
    : (() => {
        const wallet = createWalletClient({ account: signer, chain: config.CHAIN === 'ethereum' ? mainnet : sepolia, transport: http(config.RPC_URL) });
        return { sendTransaction: (tx: { to: Address; data: Hex; value?: bigint }) => wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value }) };
      })();
  const deps: Deps = {
    config, db, handle,
    swap: sera ?? new SampleRateSwapProvider(),
    sera,
    ramps,
    screening: config.CHAINALYSIS_API_KEY ? new ChainalysisSanctionsScreening(config.CHAINALYSIS_API_KEY) : patternScreening,
    notifier: config.SMTP_URL ? new SmtpNotifier(db, config.SMTP_URL, config.SMTP_FROM) : new OutboxNotifier(db),
    chain: await createChainAdapter(config, readDemoBalances),
    signer,
    relay,
    webhooks: new WebhookService(db, config.WEBHOOK_RETRIES),
    now: () => new Date(),
    ...overrides,
  };
  return deps;
}
