import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { campaignRead, decodedInteger } from "./campaign-chain.ts";
import { ConfigurationError } from "./environment.ts";

export async function marketAccounting(rpc: JsonRpcProvider, block: number) {
  const methods = ["totalBound", "totalCredits", "totalLiabilities"] as const;
  const reads = await Promise.all(
    methods.map((method) => campaignRead(rpc, "market", method, [], block)),
  );
  const balances = await Promise.all(
    [campaignContracts.market.address, ...Object.values(campaignActors)].map((address) =>
      campaignRead(rpc, "settlementToken", "balanceOf", [address], block),
    ),
  );
  const credits = await Promise.all(
    Object.values(campaignActors).map((address) =>
      campaignRead(rpc, "market", "credits", [address], block),
    ),
  );
  const value = (index: number, values: typeof reads) => decodedInteger(values[index]?.decoded[0]);
  const result = {
    bound: value(0, reads),
    credits: value(1, reads),
    liabilities: value(2, reads),
    balance: value(0, balances),
    payerBalance: value(1, balances),
    sellerBalance: value(2, balances),
    buyerBalance: value(3, balances),
    payerCredit: value(0, credits),
    sellerCredit: value(1, credits),
    buyerCredit: value(2, credits),
  };
  if (result.bound + result.credits !== result.liabilities || result.balance < result.liabilities)
    throw new ConfigurationError("Market accounting or coverage inconsistent");
  return result;
}
