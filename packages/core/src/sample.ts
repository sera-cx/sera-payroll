/**
 * Sample data, the same as the prototype. All names, salaries, client names, rates,
 * fees and wallet addresses are samples.
 */
import { emptyWallet } from './address.js';
import { SAMPLE_RATES, type Fiat, type PayoutOption } from './currencies.js';
import type { AddressSource, Balances, ClientSettings, EngineContext, Person, PersonType, Plugins, Ramps, RunDraft } from './types.js';

export const NETWORK_FEE_USD = '0.20';
export const PLUGIN_SAMPLE_RATE = '0.10';
export const DEFAULT_HOLD_HOURS = 48;

function wallet(addr: string, source: AddressSource | '', locked: boolean) {
  const w = emptyWallet('ethereum');
  if (!addr) return w;
  return { ...w, address: addr, source: source || null, locked, tested: true, screening: 'unscreened' as const };
}

export function person(id: string, name: string, type: PersonType, monthlyPay: string, currency: Fiat, a: PayoutOption, b: PayoutOption | null, pct: number, w: ReturnType<typeof wallet>, kyc: boolean, setup: boolean): Person {
  return { id, name, type, monthlyPay, currency, payoutPrimary: a, payoutSecondary: b, splitPercent: pct, kycVerified: kyc, setupDone: setup, wallet: w };
}

export interface SampleClient {
  id: string;
  name: string;
  settings: ClientSettings;
  people: Person[];
  balances: Balances;
  fundingSource: PayoutOption;
}

export const SAMPLE_RAMPS: Ramps = {
  USD: { onRamp: true, offRamp: true }, MYR: { onRamp: true, offRamp: true }, SGD: { onRamp: true, offRamp: true },
  IDR: { onRamp: false, offRamp: false }, JPY: { onRamp: false, offRamp: false },
};
export const SAMPLE_PLUGINS: Plugins = { MYR: false, SGD: false, IDR: false };

const baseSettings = (fee: string, twoPerson: boolean): ClientSettings => ({
  twoPerson, multisig: false, schedule: 'Monthly on the 28th', gasPayer: 'employer', requireTestPayment: false, feePercent: fee, addressHoldHours: DEFAULT_HOLD_HOURS,
});

export const SAMPLE_CLIENTS: SampleClient[] = [
  {
    id: 'client-studio', name: 'Sample Studio Sdn Bhd', settings: baseSettings('0.5', true), fundingSource: 'USDT',
    balances: { USDT: '12000', USDC: '6000', MYRT: '40000', XSGD: '3000' },
    people: [
      person('p1', 'Aisyah Rahman', 'Employee', '8500', 'MYR', 'MYRT', null, 100, wallet('0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', 'employee_signed', false), true, true),
      person('p2', 'Tan Wei Jie', 'Employee', '6200', 'SGD', 'bank:SGD', null, 100, wallet('', '', false), true, true),
      person('p3', 'Nurul Huda', 'Employee', '6000', 'MYR', 'bank:MYR', 'USDT', 70, wallet('0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f01', 'employer', false), true, true),
      person('p4', 'Daniel Lee', 'Contractor', '4000', 'USD', 'USDC', null, 100, wallet('0x9E8d7C6b5A4f3E2d1C0b9A8f7E6d5C4b3A2f1E0d', 'employee_signed', true), false, true),
      person('p5', 'Putri Wulandari', 'Contractor', '18000000', 'IDR', 'IDRT', null, 100, wallet('', '', false), false, false),
    ],
  },
  {
    id: 'client-labs', name: 'Sample Labs Pte Ltd', settings: baseSettings('0.35', false), fundingSource: 'XSGD',
    balances: { USDT: '30000', USDC: '15000', MYRT: '0', XSGD: '20000' },
    people: [
      person('p101', 'Chen Li Ting', 'Employee', '7800', 'SGD', 'XSGD', null, 100, wallet('0x5d3E1f9A7c4B2086e1D4a7C0b3F6e9D2c5A8b1E4', 'employee_signed', false), true, true),
      person('p102', 'Arif Hidayat', 'Contractor', '25000000', 'IDR', 'USDT', null, 100, wallet('0x8a6C4e2F0b9D7135c3E5a7F9b1D3c5E7a9F1b3D5', 'employee_signed', false), false, true),
      person('p103', 'Grace Tan', 'Employee', '5400', 'SGD', 'bank:SGD', null, 100, wallet('', '', false), true, true),
    ],
  },
  {
    id: 'client-exports', name: 'Sample Exports Ltd', settings: baseSettings('0.8', false), fundingSource: 'USDC',
    balances: { USDT: '50000', USDC: '40000', MYRT: '0', XSGD: '0' },
    people: [
      person('p201', 'Farah Iskandar', 'Employee', '9200', 'MYR', 'bank:MYR', null, 100, wallet('', '', false), true, true),
      person('p202', 'Hiroshi Tanaka', 'Contractor', '600000', 'JPY', 'JPYC', null, 100, wallet('0x2f4A6c8E0b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A', 'employer', false), false, true),
    ],
  },
];

export function sampleContext(clientIndex = 0, overrides: Partial<EngineContext> = {}): EngineContext {
  const c = SAMPLE_CLIENTS[clientIndex]!;
  const run: RunDraft = { idx: 0, status: 'draft', fundingSource: c.fundingSource, oneOffs: [], skipped: [], funded: false };
  return {
    people: structuredClone(c.people), run, settings: { ...c.settings }, ramps: structuredClone(SAMPLE_RAMPS), plugins: { ...SAMPLE_PLUGINS },
    rates: { ...SAMPLE_RATES }, balances: { ...c.balances }, networkFeeUsd: NETWORK_FEE_USD, pluginRate: PLUGIN_SAMPLE_RATE, ...overrides,
  };
}
