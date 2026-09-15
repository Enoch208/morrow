import type { JsonRpcProvider } from "ethers";
import { campaignContracts } from "./campaign-config.ts";
import type { PinnedContracts } from "./campaign-config.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { ConfigurationError } from "./errors.ts";

export const tradeContracts = {
  ...campaignContracts,
  market: {
    address: "0x375fDD3C43Fc4e0d8E8b2BeCBccd0f0CDA71D479",
    chainId: 102031n,
    name: "MorrowMarketV2",
    codeHash: "0x96163a0e1b44f37cf02ad63d0434927b17446ca4f5e10ae442eb768f49d2c141",
  },
} as const satisfies PinnedContracts;

export const tradeMarketDeploymentBlock = 5_491_342;
export const minimumAttestedDepth = 64n;

export function contractsForMarket(market: string): PinnedContracts {
  const pinned = [campaignContracts, tradeContracts].find(
    (contracts) => contracts.market.address.toLowerCase() === market.toLowerCase(),
  );
  if (!pinned) throw new ConfigurationError("Sale names an unpinned market");
  return pinned;
}

export function tradeRead(
  rpc: JsonRpcProvider,
  key: keyof PinnedContracts,
  method: string,
  args: readonly unknown[] = [],
  blockTag: number | "latest" = "latest",
) {
  return campaignRead(rpc, key, method, args, blockTag, tradeContracts);
}

export function verifyTradeContract(
  rpc: JsonRpcProvider,
  key: keyof PinnedContracts,
  blockTag: number | "latest" = "latest",
) {
  return verifyCampaignContract(rpc, key, blockTag, tradeContracts);
}
