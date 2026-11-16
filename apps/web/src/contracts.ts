/** Reference deployment on Sepolia, from contracts/deployments/sepolia.json. Update both when redeploying. */
export const SEPOLIA_CONTRACTS = {
  chainId: 11155111,
  explorer: 'https://sepolia.etherscan.io',
  PayrollDisburser: '0x874DE1F483Dd5C053E51cf9e9dAc161452050b85',
  PayslipRegistry: '0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D',
  tUSDT: '0x608007F91A38D43E964939C2F29c4397349F71AC',
  tMYRT: '0xCc0054146fBE0105655633ce4ebb2930acc3FFC1',
} as const;

/** One sample payroll run paid and anchored on Sepolia with these contracts, from contracts/deployments/sepolia-sample-run.json. */
export const SEPOLIA_SAMPLE_RUN = {
  runLabel: 'October 2026 payroll',
  employerName: 'Sample Studio Sdn Bhd',
  payday: '2026-10-28',
  legs: 2,
  disburseTx: '0xeca6d081fe8bcf6c6a9375922281fe52dbc9373a63d8e05e67589e4c9e59b08e',
  anchorTx: '0x3e2a9e87357365fb8bba82957b93a0fde170df9ba1acd17b73700b43d413b6f9',
  anchorId: '0x9f738bbc60f88d9e8544e6923bcaa15379f8432dbba348b34c55cfb82727c339',
} as const;
