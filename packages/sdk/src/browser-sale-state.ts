import type { JsonRpcProvider } from "ethers";
import { getAddress } from "ethers";
import type { Claim, SaleTerms } from "@morrow/protocol";
import { withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedClaim, decodedInteger, decodedTuple } from "./decoded-state.ts";
import { saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";
import {
  tradeContracts,
  tradeMarketDeploymentBlock,
  tradeRead,
  verifyTradeContract,
} from "./trade-contracts.ts";

export const marketDeploymentBlock = tradeMarketDeploymentBlock;

export interface SaleProgress {
  readonly claim: Claim;
  readonly sourceState: bigint;
  readonly sourceTimestamp: bigint;
  readonly destinationState: bigint;
  readonly viewerCreditRaw: bigint;
  readonly fundingHash?: string;
  readonly recognitionHash?: string;
}

function marketTopic(name: string): string {
  const event = contractInterfaces.market.getEvent(name);
  if (!event) throw new ConfigurationError(`Missing market event ${name}`);
  return event.topicHash;
}

async function marketLog(destination: JsonRpcProvider, names: readonly string[], saleId: string) {
  const logs = await destination.getLogs({
    address: tradeContracts.market.address,
    topics: [names.map(marketTopic), saleId],
    fromBlock: marketDeploymentBlock,
    toBlock: "latest",
  });
  return logs.at(-1)?.transactionHash;
}

export async function readSaleProgress(
  terms: SaleTerms,
  viewer: string,
  options: BrowserActionOptions,
): Promise<SaleProgress> {
  const saleId = saleIdentity(terms).saleId;
  return withBrowserAction(options, async ({ source, destination }) => {
    const [sourceBlock, destinationBlock] = await Promise.all([
      source.getBlock("latest"),
      destination.getBlock("latest"),
    ]);
    if (!sourceBlock || !destinationBlock)
      throw new ConfigurationError("Latest blocks unavailable");
    await Promise.all([
      verifyTradeContract(source, "vault", sourceBlock.number),
      verifyTradeContract(destination, "market", destinationBlock.number),
    ]);
    const [claimRead, roundRead, saleRead, creditRead, fundingHash, recognitionHash] =
      await Promise.all([
        tradeRead(source, "vault", "getClaim", [terms.claimId], sourceBlock.number),
        tradeRead(source, "vault", "getRound", [terms.claimId, terms.round], sourceBlock.number),
        tradeRead(destination, "market", "getSale", [saleId], destinationBlock.number),
        tradeRead(destination, "market", "credits", [getAddress(viewer)], destinationBlock.number),
        marketLog(destination, ["ReservationFunded"], saleId),
        marketLog(destination, ["AssignmentRecognized", "CancellationRecognized"], saleId),
      ]);
    return {
      claim: decodedClaim(claimRead.decoded[0], terms.claimId),
      sourceState: decodedInteger(decodedTuple(roundRead.decoded[0], 4)[1]),
      sourceTimestamp: BigInt(sourceBlock.timestamp),
      destinationState: decodedInteger(decodedTuple(saleRead.decoded[0], 2)[1]),
      viewerCreditRaw: decodedInteger(creditRead.decoded[0]),
      ...(fundingHash ? { fundingHash } : {}),
      ...(recognitionHash ? { recognitionHash } : {}),
    };
  });
}

export async function readClaimState(claimId: bigint, options: BrowserActionOptions) {
  return withBrowserAction(options, async ({ source }) => {
    const block = await source.getBlock("latest");
    if (!block) throw new ConfigurationError("Latest source block unavailable");
    await verifyTradeContract(source, "vault", block.number);
    const read = await tradeRead(source, "vault", "getClaim", [claimId], block.number);
    return { claim: decodedClaim(read.decoded[0], claimId), timestamp: BigInt(block.timestamp) };
  });
}

export async function readMarketRules(options: BrowserActionOptions) {
  return withBrowserAction(options, async ({ destination }) => {
    const [fee, recipient] = await Promise.all([
      tradeRead(destination, "market", "FEE_BPS"),
      tradeRead(destination, "market", "FEE_RECIPIENT"),
    ]);
    return {
      feeBps: decodedInteger(fee.decoded[0]),
      feeRecipient: getAddress(String(recipient.decoded[0])),
    };
  });
}

export async function readTokenBalances(wallet: string, options: BrowserActionOptions) {
  return withBrowserAction(options, async ({ source, destination }) => {
    const [sourceBalance, settlementBalance] = await Promise.all([
      tradeRead(source, "sourceToken", "balanceOf", [getAddress(wallet)]),
      tradeRead(destination, "settlementToken", "balanceOf", [getAddress(wallet)]),
    ]);
    return {
      sourceRaw: decodedInteger(sourceBalance.decoded[0]),
      settlementRaw: decodedInteger(settlementBalance.decoded[0]),
    };
  });
}
