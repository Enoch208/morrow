import { chains, type ChainKey } from "@/lib/explorers";
import { errorCode, type Eip1193Provider } from "./eip1193";

function hexChainId(chain: ChainKey): string {
  return `0x${chains[chain].evmChainId.toString(16)}`;
}

export async function switchToChain(provider: Eip1193Provider, chain: ChainKey): Promise<void> {
  const target = chains[chain];
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId(chain) }],
    });
  } catch (error) {
    if (errorCode(error) !== 4902) {
      throw error;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId(chain),
          chainName: target.name,
          nativeCurrency: target.nativeCurrency,
          rpcUrls: [target.rpc],
          blockExplorerUrls: [target.base],
        },
      ],
    });
  }
}

export function chainKeyFor(chainId: number | undefined): ChainKey | undefined {
  return (Object.keys(chains) as ChainKey[]).find((key) => chains[key].evmChainId === chainId);
}
