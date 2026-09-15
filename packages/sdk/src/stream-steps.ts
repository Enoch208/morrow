import { getAddress } from "ethers";
import type { JsonRpcProvider, TransactionReceipt, TransactionRequest } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { campaignActors } from "./campaign-config.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedClaim } from "./decoded-state.ts";
import { ConfigurationError, proverEndpoints } from "./environment.ts";
import { obtainProof, verifyNativeProof } from "./proof.ts";
import {
  assignWindowSeconds,
  fundWindowSeconds,
  sablierLockup,
  streamFeeBps,
  streamPriceRaw,
  streamTokens,
} from "./stream-config.ts";
import { setupRequest, vaultInterface } from "./stream-setup.ts";
import type { StreamStep } from "./stream-config.ts";
import { settledStream, streamField, streamTerms } from "./stream-log.ts";

export interface StreamContext {
  readonly source: JsonRpcProvider;
  readonly destination: JsonRpcProvider;
  readonly records: readonly Record<string, unknown>[];
}

export interface StreamRequest {
  readonly request: TransactionRequest;
  readonly context?: Record<string, unknown>;
}

export function createdStreamId(receipt: TransactionReceipt): bigint {
  const transfer = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === sablierLockup.toLowerCase() &&
      log.topics.length === 4 &&
      log.topics[1] === `0x${"00".repeat(32)}`,
  );
  if (!transfer?.topics[3]) throw new ConfigurationError("Stream mint log not found");
  return BigInt(transfer.topics[3]);
}

export function localLogIndex(receipt: TransactionReceipt, emitter: string, topic: string): bigint {
  const index = receipt.logs.findIndex(
    (log) => log.address.toLowerCase() === emitter.toLowerCase() && log.topics[0] === topic,
  );
  if (index < 0) throw new ConfigurationError("Expected sale event absent from receipt");
  return BigInt(index);
}

async function provenEvent(context: StreamContext, step: StreamStep, eventName: string) {
  const hash = settledStream(context.records, step).transactionHash;
  const receipt = await context.source.getTransactionReceipt(hash);
  if (receipt?.status !== 1) throw new ConfigurationError("Source transaction missing or failed");
  const { proof } = await obtainProof(hash, proverEndpoints[0]);
  const native = await verifyNativeProof(
    context.destination,
    proof,
    await context.destination.getBlockNumber(),
  );
  if (native.verification.decoded[0] !== true)
    throw new ConfigurationError("Native verifier refused proof");
  const event = vaultInterface.getEvent(eventName);
  if (!event) throw new ConfigurationError(`Unknown vault event ${eventName}`);
  return {
    proof,
    logIndex: localLogIndex(
      receipt,
      streamField(context.records, "deploy-stream-vault", "contractAddress"),
      event.topicHash,
    ),
  };
}

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
      return {
        request: { to: market(), data: contractInterfaces.market.encodeFunctionData("withdraw") },
      };
    case "redeem":
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("redeem", [streamTerms(records).claimId]),
        },
      };
  }
}
