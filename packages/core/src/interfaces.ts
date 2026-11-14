/**
 * Section 9: the interfaces every outside service sits behind, so forks can swap them.
 * Sera.cx is the default SwapProvider. Keep it: the non-USD pairs are the reason to stay on it.
 */
import type { Address, Hex } from 'viem';
import type { Fiat, Stablecoin } from './currencies.js';
import type { Network, Person } from './types.js';

/** A rate Sera.cx will settle at, with actual liquidity behind it. Never describe it as a quote. */
export interface SwapRate {
  from: Stablecoin;
  to: Stablecoin;
  /** Amount of `from` the rate was fetched for, decimal string. */
  amountIn: string;
  /** Amount of `to` that settles, decimal string. */
  amountOut: string;
  /** to per 1 from, decimal string. */
  rate: string;
  /** Opaque provider reference used to settle at this rate. */
  reference: string;
  /** When the rate stops being settleable. */
  validUntil: Date;
  network: Network;
}

export interface SettlementLeg {
  payoutId: string;
  from: Stablecoin;
  to: Stablecoin;
  amountIn: string;
  minAmountOut: string;
  recipient: Address;
  rateReference: string;
}

export interface SettlementResult {
  payoutId: string;
  status: 'submitted' | 'settled' | 'failed';
  txHash: Hex | null;
  amountOut: string | null;
  reason: string | null;
}

/** A signer the SwapProvider can ask for EIP-712 signatures. The treasury wallet or a multisig front-end. */
export interface IntentSigner {
  address: Address;
  signTypedData(args: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }): Promise<Hex>;
}

export interface SwapProvider {
  readonly name: string;
  getRate(from: Stablecoin, to: Stablecoin, amountIn: string, network: Network): Promise<SwapRate>;
  /** Settle a batch of legs non-custodially. Idempotent per payoutId. */
  settle(legs: SettlementLeg[], signer: IntentSigner, network: Network, idempotencyKey: string): Promise<SettlementResult[]>;
  getStatus(payoutId: string): Promise<SettlementResult | null>;
}

export interface DepositInstructions {
  reference: string;
  beneficiary: string;
  accountDetails: Record<string, string>;
  amount: string;
  currency: Fiat;
  expiresAt: Date;
}

export type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'rejected';

export interface BankPayout {
  id: string;
  status: 'created' | 'sent' | 'arrived' | 'failed';
  /** The partner's deposit address that the stablecoin leg must be sent to. */
  depositAddress: Address;
  stablecoin: Stablecoin;
  reason: string | null;
}

/** One per partner and currency. Bank details never touch this app: the partner holds them. */
export interface RampAdapter {
  readonly name: string;
  readonly currency: Fiat;
  getDepositInstructions(clientId: string, amount: string, currency: Fiat): Promise<DepositInstructions>;
  confirmFundsReceived(reference: string): Promise<{ received: boolean; stablecoin: Stablecoin; amount: string | null }>;
  startEmployeeVerification(person: Pick<Person, 'id' | 'name'>, returnUrl: string): Promise<{ url: string; partnerReference: string }>;
  getVerificationStatus(partnerReference: string): Promise<VerificationStatus>;
  createBankPayout(partnerReference: string, amount: string, currency: Fiat, idempotencyKey: string): Promise<BankPayout>;
  getPayoutStatus(payoutId: string): Promise<BankPayout>;
}

export interface ScreeningResult { status: 'clear' | 'flagged'; reason: string | null; provider: string; at: Date }

export interface ScreeningProvider {
  readonly name: string;
  screen(address: Address, network: Network): Promise<ScreeningResult>;
}

export interface DeductionLine { label: string; amount: string; payer: 'employee' | 'employer' }
export interface StatutoryResult { deductions: DeductionLine[]; employeeDeduction: string; net: string }

/** One per country. Contractors are paid gross, the engine never calls a plug-in for them. */
export interface StatutoryPlugin {
  readonly country: string;
  readonly currency: Fiat;
  compute(gross: string, person: Pick<Person, 'id' | 'type'>, period: { label: string; payday: Date }): StatutoryResult;
}

export type NotificationKind =
  | 'run.submitted' | 'run.sent' | 'paid' | 'invite'
  | 'address.change_requested' | 'address.change_requested_employee' | 'address.locked'
  | 'payout.failed' | 'payout.held';

export interface Notifier {
  send(to: { email: string | null; name: string }, kind: NotificationKind, data: Record<string, unknown>): Promise<{ id: string }>;
}

export const WEBHOOK_EVENTS = [
  'run.submitted', 'run.sent', 'run.complete',
  'payout.screened', 'payout.swapped', 'payout.sent', 'payout.arrived', 'payout.failed', 'payout.held',
  'address.change_requested', 'address.locked', 'payslip.anchored',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * On-chain operations behind one interface so the API can run against a mock in
 * tests and the real chain (Sepolia for the public demo) in production.
 */
export interface TokenBalance { stablecoin: Stablecoin; address: Address; decimals: number; balanceRaw: string; balance: string }

export interface DisburseLeg { payoutId: string; stablecoin: Stablecoin; to: Address; amount: string }
export interface DisburseResult { txHash: Hex; legs: { payoutId: string; ok: boolean; reason: string | null }[] }

export interface PayslipAnchorInput { runId: string; personId: string; payday: Date; root: Hex; docHash: Hex; employerSignature: Hex }
export interface PayslipAnchorResult { txHash: Hex; anchorId: Hex }

export interface ChainAdapter {
  readonly network: Network;
  readonly chainId: number;
  tokenAddress(stablecoin: Stablecoin): Address;
  balances(owner: Address, stablecoins: Stablecoin[]): Promise<TokenBalance[]>;
  /** Batched ERC-20 transfers from the treasury through PayrollDisburser. Idempotent per runId+payoutId on chain. */
  disburse(runId: string, legs: DisburseLeg[], signer: IntentSigner & { sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex> }): Promise<DisburseResult>;
  anchorPayslip(input: PayslipAnchorInput, signer: { sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex> }): Promise<PayslipAnchorResult>;
  waitForReceipt(txHash: Hex): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }>;
  explorerTxUrl(txHash: Hex): string;
}
