import type { SaleTerms } from "@morrow/protocol";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

export const c5Times = {
  readiness: 1789289100n,
  launch: 1789290000n,
  round2Launch: 1789296300n,
  maturity: 1789306200n,
} as const;

export function c5Terms(claimId: bigint, round: bigint): SaleTerms {
  if (claimId < 0n || (round !== 1n && round !== 2n))
    throw new ConfigurationError("Unsupported C5 claim or round");
  return {
    protocolVersion: 1n,
    sourceEvmChainId: 11155111n,
    sourceVault: campaignContracts.vault.address,
    claimId,
    round,
    destinationEvmChainId: 102031n,
    destinationMarket: campaignContracts.market.address,
    seller: campaignActors.SELLER,
    buyer: campaignActors.BUYER,
    sourceToken: campaignContracts.sourceToken.address,
    sourceFaceValueRaw: 10000000n,
    maturity: c5Times.maturity,
    settlementToken: campaignContracts.settlementToken.address,
    grossPurchasePriceRaw: 9410000n,
    feeBps: 50n,
    feeRecipient: campaignActors.PAYER,
    fundBefore: round === 1n ? 1789293600n : 1789299900n,
    assignBefore: round === 1n ? 1789295400n : 1789301700n,
  };
}
