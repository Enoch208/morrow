import { JsonRpcProvider } from "ethers";
import { chains, type ChainKey } from "@/lib/explorers";

export const providers: Readonly<Record<ChainKey, JsonRpcProvider>> = {
  sepolia: new JsonRpcProvider(chains.sepolia.rpc, chains.sepolia.evmChainId, {
    staticNetwork: true,
  }),
  cc3: new JsonRpcProvider(chains.cc3.rpc, chains.cc3.evmChainId, { staticNetwork: true }),
};
