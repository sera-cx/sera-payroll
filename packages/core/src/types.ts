import type { Fiat, PayoutOption, Stablecoin } from './currencies.js';
import type { Schedule } from './schedule.js';

export type PersonType = 'Employee' | 'Contractor';
export type AddressSource = 'employer' | 'employee_signed' | 'employee_pasted';
export type ScreeningStatus = 'unscreened' | 'clear' | 'flagged';
export type Network = 'ethereum' | 'sepolia' | 'base-sepolia' | 'sera-appchain';

export interface PendingChange {
  address: string;
  source: AddressSource;
  requestedAt: Date;
  /** When the hold lapses and the change goes live without employer action. */
  liveAt: Date;
}

export interface WalletAddress {
  address: string | null;
  network: Network;
  source: AddressSource | null;
  /** Hex signature when source is employee_signed. Verified on the server. */
  signature: string | null;
  locked: boolean;
  tested: boolean;
  screening: ScreeningStatus;
  screeningReason: string | null;
  pending: PendingChange | null;
}

export interface AddressEvent {
  at: Date;
  actor: string;
  action: string;
  oldAddress: string | null;
  newAddress: string | null;
}

export interface Person {
  id: string;
  name: string;
  type: PersonType;
  /** Monthly pay in `currency`, as a decimal string. */
  monthlyPay: string;
  currency: Fiat;
  payoutPrimary: PayoutOption;
  payoutSecondary: PayoutOption | null;
  /** Percent of net going to the primary option when a secondary is set. */
  splitPercent: number;
  /** Verified with the off-ramp partner for bank payouts. */
  kycVerified: boolean;
  setupDone: boolean;
  wallet: WalletAddress;
}

export type GasPayer = 'employer' | 'employee';

export interface ClientSettings {
  twoPerson: boolean;
  multisig: boolean;
  schedule: Schedule;
  gasPayer: GasPayer;
  requireTestPayment: boolean;
  /** Operator fee, percent of payouts. */
  feePercent: string;
  /** Hold on an employee-requested address change, in hours. Operator-configurable. */
  addressHoldHours: number;
}

export interface RampAvailability { onRamp: boolean; offRamp: boolean }
export type Ramps = Record<Fiat, RampAvailability>;
export type Plugins = Partial<Record<Fiat, boolean>>;

export type LineKind = 'Salary' | 'Bonus' | 'Contractor invoice' | 'Reimbursement';

export interface OneOff {
  id: string;
  personId: string;
  amount: string;
  currency: Fiat;
  kind: Exclude<LineKind, 'Salary'>;
}

export type RunStatus = 'draft' | 'submitted' | 'sent' | 'complete';

export interface RunDraft {
  idx: number;
  status: RunStatus;
  fundingSource: PayoutOption;
  oneOffs: OneOff[];
  skipped: string[];
  /** Bank funding only: on-ramp partner confirmed funds. */
  funded: boolean;
}

export interface Balances { [coin: string]: string }

export interface EngineContext {
  people: Person[];
  run: RunDraft;
  settings: ClientSettings;
  ramps: Ramps;
  plugins: Plugins;
  rates: Record<Fiat, string>;
  balances: Balances;
  /** Sample network fee per payout in USD. Real build: gas estimate. */
  networkFeeUsd: string;
  /** Flat sample deduction when a plug-in is on. Real build: StatutoryPlugin. */
  pluginRate: string;
}

export type FundingState =
  | { kind: 'wallet'; balance: string; shortBy: string; ok: boolean }
  | { kind: 'bank'; rampOk: boolean; funded: boolean; ok: boolean };

export type PayoutState = 'queued' | 'running' | 'done' | 'failed' | 'held';

export const PAYOUT_STAGES = {
  screened: 'Screened',
  swapped: 'Swapped on Sera.cx',
  sentWallet: 'Sent to wallet',
  sentRamp: 'Sent to off-ramp partner',
  arrived: 'Arrived at bank',
} as const;
export type PayoutStage = (typeof PAYOUT_STAGES)[keyof typeof PAYOUT_STAGES];

export type { Fiat, PayoutOption, Stablecoin };
