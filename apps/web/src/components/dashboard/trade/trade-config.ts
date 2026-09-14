import type { BrowserActionOptions } from "@morrow/sdk/browser";
import { chains } from "@/lib/explorers";

export const tradeOptions: BrowserActionOptions = {
  sourceRpcUrl: chains.sepolia.rpc,
  destinationRpcUrl: chains.cc3.rpc,
};

export const proverUrl = "https://prover.cc3-testnet.creditcoin.network";

export const settlementTokenSymbol = "mSET";
export const sourceTokenSymbol = "mSRC";
