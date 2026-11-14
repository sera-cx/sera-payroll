/** Re-exports from core plus one helper, so the mock state file stays readable. */
import { keccak256, toHex } from 'viem';
export * from '@sera-payroll/core';
export const keccak256Hex = (s: string) => keccak256(toHex(s));
