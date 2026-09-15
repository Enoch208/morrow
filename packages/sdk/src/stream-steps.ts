import { getAddress } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { campaignActors } from "./campaign-config.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedClaim } from "./decoded-state.ts";
import { ConfigurationError } from "./environment.ts";
import {
  assignWindowSeconds,
  fundWindowSeconds,
  lockupInterface,
  sablierLockup,
  streamFeeBps,
  streamPriceRaw,
  streamTokens,
} from "./stream-config.ts";
import { setupRequest, vaultInterface } from "./stream-setup.ts";
import type { StreamStep } from "./stream-config.ts";
import { streamField, streamTerms } from "./stream-log.ts";
import { provenEvent } from "./stream-evidence.ts";
import type { StreamContext, StreamRequest } from "./stream-evidence.ts";

async function saleTerms(context: StreamContext): Promise<SaleTerms> {
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

export async function streamRequest(
  step: StreamStep,
  context: StreamContext,
): Promise<StreamRequest> {
  const { records } = context;
  const vault = () => streamField(records, "deploy-stream-vault", "contractAddress");
  const market = () => streamField(records, "deploy-stream-market", "contractAddress");
  switch (step) {
    case "deploy-stream-vault":
    case "deploy-stream-market":
    case "approve-lockup":
    case "create-cancelable-stream":
    case "wrap-cancelable-refused":
    case "create-stream":
    case "approve-stream":
    case "wrap-stream":
      return setupRequest(step, records);
    case "reserve": {
      const terms = await saleTerms(context);
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("reserveSale", [terms.claimId, terms]),
        },
        context: { canonicalTerms: encodeTerms(terms), saleId: saleIdentity(terms).saleId },
      };
    }
    case "approve-fund":
      return {
        request: {
          to: streamTokens.settlement,
          data: contractInterfaces.settlementToken.encodeFunctionData("approve", [
            market(),
            streamPriceRaw,
          ]),
        },
      };
    case "fund": {
      const { proof, logIndex } = await provenEvent(context, "reserve", "SaleReserved");
      return {
        request: {
          to: market(),
          data: contractInterfaces.market.encodeFunctionData("fundReservation", [
            proof,
            logIndex,
            streamTerms(records),
          ]),
        },
      };
    }
    case "assign": {
      const terms = streamTerms(records);
      const identity = saleIdentity(terms);
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("assignSale", [
            terms.claimId,
            terms.round,
            identity.termsHash,
          ]),
        },
      };
    }
    case "settle": {
      const { proof, logIndex } = await provenEvent(context, "assign", "SaleAssigned");
      return {
        request: {
          to: market(),
          data: contractInterfaces.market.encodeFunctionData("settleAssignment", [
            proof,
            logIndex,
            saleIdentity(streamTerms(records)).saleId,
          ]),
        },
      };
    }
    case "withdraw-seller":
    case "withdraw-buyer":
      return {
        request: { to: market(), data: contractInterfaces.market.encodeFunctionData("withdraw") },
      };
    case "cancel": {
      const terms = streamTerms(records);
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("cancelExpiredSale", [
            terms.claimId,
            terms.round,
          ]),
        },
      };
    }
    case "recognize": {
      const { proof, logIndex } = await provenEvent(context, "cancel", "SaleCancelled");
      return {
        request: {
          to: market(),
          data: contractInterfaces.market.encodeFunctionData("recognizeCancellation", [
            proof,
            logIndex,
            saleIdentity(streamTerms(records)).saleId,
          ]),
        },
      };
    }
    case "redeem": {
      const streamId = BigInt(streamField(records, "create-stream", "streamId"));
      const [depleted, fee] = await Promise.all([
        context.source.call({
          to: sablierLockup,
          data: lockupInterface.encodeFunctionData("isDepleted", [streamId]),
        }),
        context.source.call({
          to: sablierLockup,
          data: lockupInterface.encodeFunctionData("calculateMinFeeWei", [streamId]),
        }),
      ]);
      const alreadyDepleted =
        lockupInterface.decodeFunctionResult("isDepleted", depleted)[0] === true;
      const [minimumFee]: unknown[] = lockupInterface.decodeFunctionResult(
        "calculateMinFeeWei",
        fee,
      );
      if (typeof minimumFee !== "bigint") throw new ConfigurationError("Invalid lockup fee read");
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("redeem", [streamTerms(records).claimId]),
          value: alreadyDepleted ? 0n : minimumFee,
        },
        context: { lockupFeeWei: alreadyDepleted ? 0n : minimumFee },
      };
    }
  }
}
