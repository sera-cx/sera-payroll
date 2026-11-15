/** Reference deployment on Sepolia, from contracts/deployments/sepolia.json. Update both when redeploying. */
export const SEPOLIA_CONTRACTS = {
  chainId: 11155111,
  explorer: 'https://sepolia.etherscan.io',
  PayrollDisburser: '0x874DE1F483Dd5C053E51cf9e9dAc161452050b85',
  PayslipRegistry: '0x1E187E50cE8F4F8ec7124DCE7FD1Abf37938449D',
  tUSDT: '0x608007F91A38D43E964939C2F29c4397349F71AC',
  tMYRT: '0xCc0054146fBE0105655633ce4ebb2930acc3FFC1',
} as const;
