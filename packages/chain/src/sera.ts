/**
 * Sera.cx network constants. These were read from GET /config and GET /tokens on 2026-11-15.
 * `GET {apiBase}/config` and `GET {apiBase}/tokens` are AUTHORITATIVE: read them at start-up and
 * treat these values as fallbacks. Addresses here are for the Sera.cx contracts the SwapProvider
 * signs against, and for the stablecoins the payroll demo pays with.
 */
import type { Address } from 'viem';
import type { Stablecoin } from '@sera-payroll/core';

export interface SeraNetwork {
  name: 'sepolia' | 'ethereum';
  chainId: number;
  /** EIP-712 verifyingContract for `Intent` (domain name "Sera", version "1"). */
  sera: Address;
  vault: Address;
  sor: Address;
  apiBase: string;
  explorer: string;
}

export const SERA_SEPOLIA: SeraNetwork = {
  name: 'sepolia',
  chainId: 11155111,
  sera: '0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e',
  vault: '0x3c7945840bAE0d7e7f3824Ebccef1962629250F0',
  sor: '0x83c1368110B640A729f3810De5FBe94b99aa5668',
  apiBase: 'https://api-testnet.sera.cx/api/v1',
  explorer: 'https://sepolia.etherscan.io',
};

export const SERA_MAINNET: SeraNetwork = {
  name: 'ethereum',
  chainId: 1,
  sera: '0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198',
  vault: '0xC7d4Fd2638e6630C8C61329878676b88A8A24D43',
  sor: '0xa7A0cf7cd6f043fCA23f29d8ae5aae6b46e11c18',
  apiBase: 'https://api.sera.cx/api/v1',
  explorer: 'https://etherscan.io',
};

export interface TokenInfo { address: Address; decimals: number }

/** Sera.cx Sepolia test stablecoins. All 6 decimals. Fallback for GET /tokens. */
export const SEPOLIA_SERA_TOKENS: Record<Stablecoin, TokenInfo> = {
  USDC: { address: '0x965d4b4546716e416e950bc30467d128455d2d0e', decimals: 6 },
  USDT: { address: '0x8365421d0e1b316fc6398d21be162992216bf2ad', decimals: 6 },
  MYRT: { address: '0x66d3b49b587b970b5835751708136adb805f1fe4', decimals: 6 },
  XSGD: { address: '0x058e06ca2628165a6cd1e80e4dc82203dc0020aa', decimals: 6 },
  IDRT: { address: '0xf295f26f7fe8a5a8a5c15ca56d8d571f891200dc', decimals: 6 },
  JPYC: { address: '0x0b2dfe45ca948a5f75e358e4000ed0adf1142150', decimals: 6 },
};

/** Ethereum mainnet stablecoins as listed by Sera.cx. Note IDRT has 2 decimals and JPYC 18. */
export const MAINNET_SERA_TOKENS: Record<Stablecoin, TokenInfo> = {
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  USDT: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
  MYRT: { address: '0x3Fc98a885E99420d0ce43Bcb81bF21A4e3F45E5f', decimals: 6 },
  XSGD: { address: '0x70e8de73ce538da2beed35d14187f6959a8eca96', decimals: 6 },
  IDRT: { address: '0x998FFE1E43fAcffb941dc337dD0468d52bA5b48A', decimals: 2 },
  JPYC: { address: '0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB', decimals: 18 },
};

export function seraNetwork(name: 'sepolia' | 'ethereum'): SeraNetwork {
  return name === 'ethereum' ? SERA_MAINNET : SERA_SEPOLIA;
}
export function seraTokens(name: 'sepolia' | 'ethereum'): Record<Stablecoin, TokenInfo> {
  return name === 'ethereum' ? MAINNET_SERA_TOKENS : SEPOLIA_SERA_TOKENS;
}

/** EIP-712 domain for Sera.cx swap intents. Prefer `GET /config` → `{ chain_id, sera_address }`. */
export function seraIntentDomain(n: SeraNetwork) {
  return { name: 'Sera', version: '1', chainId: n.chainId, verifyingContract: n.sera } as const;
}

/** Primary type `Intent`, from orderbook-contract-v2 SeraLib.sol. Sign `quote.route_params` exactly as returned. */
export const SERA_INTENT_TYPES = {
  Intent: [
    { name: 'taker', type: 'address' },
    { name: 'inputToken', type: 'address' },
    { name: 'outputToken', type: 'address' },
    { name: 'maxInputAmount', type: 'uint256' },
    { name: 'minOutputAmount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'initialDepositAmount', type: 'uint256' },
    { name: 'uuid', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
  ],
} as const;
