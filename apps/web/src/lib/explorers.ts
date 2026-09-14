export const chains = {
  sepolia: {
    evmChainId: 11155111,
    name: "Sepolia",
    explorer: "Etherscan",
    base: "https://sepolia.etherscan.io",
    rpc: "https://sepolia.gateway.tenderly.co",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  },
  cc3: {
    evmChainId: 102031,
    name: "Creditcoin CC3 Testnet",
    explorer: "Blockscout",
    base: "https://creditcoin-testnet.blockscout.com",
    rpc: "https://rpc.cc3-testnet.creditcoin.network",
    nativeCurrency: { name: "Testnet CTC", symbol: "tCTC", decimals: 18 },
  },
} as const;

export type ChainKey = keyof typeof chains;

export function transactionUrl(chain: ChainKey, hash: string): string {
  return `${chains[chain].base}/tx/${hash}`;
}

export function addressUrl(chain: ChainKey, address: string): string {
  return `${chains[chain].base}/address/${address}`;
}

export const repositoryUrl = "https://github.com/Enoch208/morrow";
