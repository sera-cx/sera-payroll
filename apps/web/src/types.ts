import type { Fiat, PayoutOption } from '@sera-payroll/core';

export type Role = 'operator_admin' | 'preparer' | 'approver' | 'employee';

export interface SessionUser { id: string; name: string; email: string | null; role: Role; clientId: string | null; operatorId: string | null; personId: string | null }
export interface NetworkInfo { name: string; chainId: number; explorer: string }
export interface Me { user: SessionUser | null; demoMode: boolean; network: NetworkInfo }
export interface DemoUser extends SessionUser { clientName?: string }

export interface PendingChange { address: string; source: string; requestedAt: string; liveAt: string }
export interface Wallet { address: string | null; network: string; source: string | null; locked: boolean; tested: boolean; screening: 'unscreened' | 'clear' | 'flagged'; screeningReason: string | null; pending: PendingChange | null }
export interface AddressEvent { at: string; actor: string; action: string; oldAddress: string | null; newAddress: string | null }
export type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected';

export interface Person {
  id: string; name: string; type: 'Employee' | 'Contractor'; monthlyPay: string; currency: Fiat;
  payoutPrimary: PayoutOption; payoutSecondary: PayoutOption | null; splitPercent: number;
  kycVerified: boolean; kycStatus: KycStatus; setupDone: boolean; email: string | null;
  wallet: Wallet; history: AddressEvent[];
}

export interface Settings {
  twoPerson: boolean; multisig: boolean; schedule: string; gasPayer: 'employer' | 'employee'; requireTestPayment: boolean;
  feePercent: string; addressHoldHours: number; treasuryWallet: string | null; brand: string;
}
export type Ramps = Record<Fiat, { onRamp: boolean; offRamp: boolean; partner: string }>;
export type Plugins = Partial<Record<Fiat, boolean>>;

export interface Client { id: string; name: string; settings: Settings; ramps: Ramps; plugins: Plugins; balances: Record<string, string>; operator: { name: string; brand: string } }

export interface PathStep { label: string; sera?: boolean }
export interface LegView { option: PayoutOption; sharePercent: number; amount: string; issue: string | null; flagged: boolean; rateLine: string; path: PathStep[] }
export interface LineView { personId: string; name: string; type: 'Employee' | 'Contractor'; kind: string; currency: Fiat; gross: string; deduction: string; net: string; skipped: boolean; oneOffId: string | null; legs: LegView[] }
export interface Deposit { reference: string; beneficiary: string; accountDetails: Record<string, string>; amount: string; currency: Fiat }
export type FundingState =
  | { kind: 'wallet'; balance: string; shortBy: string; ok: boolean }
  | { kind: 'bank'; rampOk: boolean; funded: boolean; ok: boolean; deposit?: Deposit };
export interface TotalsView {
  fundingCurrency: Fiat; fundingAsset: string; payouts: string; count: number; swaps: number; toBank: number; toWallet: number; issues: number; held: number;
  fee: string; feePercent: string; gas: string; need: string; funding: FundingState; ready: boolean; canSend: boolean;
}
export interface TypedData { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }
export interface RunView {
  id: string; idx: number; status: 'draft' | 'submitted' | 'sent' | 'complete'; label: string; payday: string; schedule: string; per: string;
  fundingSource: PayoutOption; fundingOptions: { option: PayoutOption; enabled: boolean; reason?: string }[]; funded: boolean;
  preparedBy: { id: string; name: string } | null; approvedBy: { id: string; name: string } | null; sentAt: string | null;
  lines: LineView[]; totals: TotalsView; rates: Record<Fiat, string>; ratesAsOf: string; rateSource: 'sample' | 'sera.cx';
  approval?: TypedData; multisig?: { threshold: number; collected: string[] };
}

export type PayoutState = 'queued' | 'running' | 'done' | 'failed' | 'held';
export interface PayoutView {
  id: string; option: PayoutOption; sharePercent: number; amount: string; amountText: string; sub: string; lockedRate: string; usdValue: string; needsSwap: boolean;
  stages: string[]; stageIndex: number; state: PayoutState; txHash: string | null; explorerUrl: string | null; failureReason: string | null; addressSnapshot: string | null; networkSnapshot: string | null; path: PathStep[];
}
export interface PayslipRef { id: string; root: string; docHash: string; anchorTx: string | null; anchorId: string | null; employerSignature: string | null; explorerUrl?: string | null }
export interface RunItem { personId: string; name: string; type: 'Employee' | 'Contractor'; kind: string; currency: Fiat; gross: string; deduction: string; net: string; payouts: PayoutView[]; payslip: PayslipRef | null }
export interface RunRecord {
  id: string; label: string; payday: string; fundingSource: PayoutOption; need: string; fee: string; gas: string; count: number; swaps: number; held: number;
  status: 'sent' | 'complete'; sentAt: string; by: string; signedWith: string; items: RunItem[];
  chainPlan?: ChainPlan;
}
/** Sera.cx permit as returned by /swap/quote: the eip712 block is signed as-is. */
export interface SeraPermit { eip712: TypedData; suggested_deadline?: number; [k: string]: unknown }
export interface ChainPlanQuote { uuid: string; routeParams: Record<string, unknown>; domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; permit: SeraPermit | null; expiresAt: number; amountOut: string }
export interface ChainPlanSwap { payoutId: string; quote?: ChainPlanQuote; error?: string }
export interface ChainPlan { swaps: ChainPlanSwap[]; directPayouts: { payoutId: string; stablecoin: string; to: string; amount: string }[]; disburse: { to: string; data: string; value?: string } | null }

export interface OutboxItem { id: string; at: string; to: string; subject: string; kind: string }
export interface AuditItem { at: string; actor: string; action: string; subject: string; detail: string }

export interface PayoutOptionView { option: PayoutOption; enabled: boolean; reason?: string; estimate: string }
export interface MeView extends Person { client: { name: string; brand: string }; ramps: Ramps; rates: Record<Fiat, string>; payoutOptions: PayoutOptionView[] }
export interface MyPayslip { runId: string; label: string; payday: string; kind: string; gross: string; deduction: string; net: string; currency: Fiat; payouts: PayoutView[]; payslip: { root: string; anchorTx: string | null; explorerUrl: string | null } | null }
export interface Disclosure { root: string; anchorTx: string | null; fields: { leaf: { name: string; value: string; salt: string }; proof: string[] }[] }

export interface OperatorClient { id: string; name: string; feePercent: string; peopleCount: number; treasuryWallet: string | null }
export interface OperatorView { id: string; name: string; brand: string; settings: { addressHoldHours: number; demoMode: boolean }; clients: OperatorClient[] }
export interface PluginView { currency: Fiat; country: string; enabled: boolean; plugin: string }
export interface ApiKey { id: string; label: string; key?: string; createdAt: string }
export interface Webhook { id: string; url: string; events: string[]; secret?: string; createdAt?: string }
export interface Delivery { at: string; event: string; status: string; responseCode: number | null }
export interface InviteInfo { personName: string; clientName: string; brand: string }
