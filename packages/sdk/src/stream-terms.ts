import { getAddress } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { campaignActors } from "./campaign-config.ts";
import { decodedClaim } from "./decoded-state.ts";
import { ConfigurationError } from "./environment.ts";
import {
  assignWindowSeconds,
  fundWindowSeconds,
  streamFeeBps,
  streamPriceRaw,
  streamTokens,
} from "./stream-config.ts";
import { streamField } from "./stream-log.ts";
import { vaultInterface } from "./stream-setup.ts";
import type { StreamContext } from "./stream-evidence.ts";

export async function saleTerms(context: StreamContext): Promise<SaleTerms> {
  const vault = streamField(context.records, "deploy-stream-vault", "contractAddress");
  const market = streamField(context.records, "deploy-stream-market", "contractAddress");
  const claimId = BigInt(streamField(context.records, "wrap-stream", "claimId"));
  const claim = decodedClaim(
    vaultInterface.decodeFunctionResult(
      "getClaim",
      await context.source.call({
        to: vault,
        data: vaultInterface.encodeFunctionData("getClaim", [claimId]),
      }),
    )[0],
    claimId,
  );
  const block = await context.source.getBlock("latest");
  if (!block) throw new ConfigurationError("Latest source block unavailable");
  const now = BigInt(block.timestamp);
  return {
    protocolVersion: 1n,
    sourceEvmChainId: 11155111n,
    sourceVault: getAddress(vault) as SaleTerms["sourceVault"],
    claimId,
    round: claim.latestRound + 1n,
    destinationEvmChainId: 102031n,
    destinationMarket: getAddress(market) as SaleTerms["destinationMarket"],
    seller: campaignActors.SELLER,
    buyer: campaignActors.BUYER,
    sourceToken: streamTokens.source,
    sourceFaceValueRaw: claim.sourceFaceValueRaw,
    maturity: claim.maturity,
    settlementToken: streamTokens.settlement,
    grossPurchasePriceRaw: streamPriceRaw,
    feeBps: streamFeeBps,
    feeRecipient: campaignActors.PAYER,
    fundBefore: now + fundWindowSeconds,
    assignBefore: now + assignWindowSeconds,
  };
}
