import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 11155111);
/** The configured chain comes first so wallets are asked to use it. */
export const chain = CHAIN_ID === 1 ? mainnet : sepolia;
const wc = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export const wagmiConfig = createConfig({
  chains: CHAIN_ID === 1 ? [mainnet, sepolia] : [sepolia, mainnet],
  connectors: [injected(), ...(wc ? [walletConnect({ projectId: wc })] : [])],
  transports: { [mainnet.id]: http(), [sepolia.id]: http() },
});

declare module 'wagmi' {
  interface Register { config: typeof wagmiConfig }
}
