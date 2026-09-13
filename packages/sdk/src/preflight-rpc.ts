import { keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import type { PreflightReaders } from "./preflight.ts";
import { campaignRead, decodedInteger, verifyCampaignContract } from "./campaign-chain.ts";
import { decodedClaim, decodedHash, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./environment.ts";

export function livePreflightReaders(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  terms: SaleTerms,
  fundingHash: string,
): PreflightReaders {
  return {
    source: async () => {
      const block = await source.getBlock("latest");
      if (!block?.hash) throw new ConfigurationError("Latest source block unavailable");
      await verifyCampaignContract(source, "vault", block.number);
      await verifyCampaignContract(source, "sourceToken", block.number);
      const [claimRead, roundRead, backing, balance, network, code] = await Promise.all([
        campaignRead(source, "vault", "getClaim", [terms.claimId], block.number),
        campaignRead(source, "vault", "getRound", [terms.claimId, terms.round], block.number),
        campaignRead(source, "vault", "totalBacking", [], block.number),
        campaignRead(source, "sourceToken", "balanceOf", [terms.sourceVault], block.number),
        source.getNetwork(),
        source.getCode(terms.sourceVault, block.number),
      ]);
      const claim = decodedClaim(claimRead.decoded[0], terms.claimId);
      const round = decodedTuple(roundRead.decoded[0], 4);
      const roundTerms = decodedTerms(round[0]);
      return {
        chainId: network.chainId,
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: BigInt(block.timestamp),
        vaultCodeHash: keccak256(code),
        terms: roundTerms,
        claimKey: saleIdentity(roundTerms).claimKey,
        saleId: decodedHash(round[2]),
        termsHash: decodedHash(round[3]),
        state: decodedInteger(round[1]),
        activeRound: claim.activeRound,
        beneficiary: claim.currentBeneficiary,
        faceValueRaw: claim.sourceFaceValueRaw,
        maturity: claim.maturity,
        sourceToken: claim.sourceToken,
        redeemed: claim.redeemed,
        successfulSale: claim.successfulSale,
        totalBacking: decodedInteger(backing.decoded[0]),
        vaultBalance: decodedInteger(balance.decoded[0]),
      };
    },
    destination: async () => {
      const block = await destination.getBlock("finalized");
      if (!block?.hash) throw new ConfigurationError("Finalized destination block unavailable");
      const abi = await verifyCampaignContract(destination, "market", block.number);
      await verifyCampaignContract(destination, "settlementToken", block.number);
      const [
        saleRead,
        bound,
        credits,
        liabilities,
        balance,
        receipt,
        network,
        marketCode,
        tokenCode,
      ] = await Promise.all([
        campaignRead(destination, "market", "getSale", [saleIdentity(terms).saleId], block.number),
        campaignRead(destination, "market", "totalBound", [], block.number),
        campaignRead(destination, "market", "totalCredits", [], block.number),
        campaignRead(destination, "market", "totalLiabilities", [], block.number),
        campaignRead(
          destination,
          "settlementToken",
          "balanceOf",
          [terms.destinationMarket],
          block.number,
        ),
        destination.getTransactionReceipt(fundingHash),
        destination.getNetwork(),
        destination.getCode(terms.destinationMarket, block.number),
        destination.getCode(terms.settlementToken, block.number),
      ]);
      if (receipt?.status !== 1)
        throw new ConfigurationError("Successful funding receipt unavailable");
      const fundingBlock = await destination.getBlock(receipt.blockNumber);
      if (fundingBlock?.hash !== receipt.blockHash)
        throw new ConfigurationError("Funding receipt block is not canonical");
      const logs = receipt.logs.filter(
        (log) =>
          log.address.toLowerCase() === terms.destinationMarket.toLowerCase() &&
          log.topics[0] === abi.getEvent("ReservationFunded")?.topicHash,
      );
      const entry = logs[0];
      const event = entry ? abi.parseLog(entry) : null;
      const fundingMatches =
        logs.length === 1 &&
        event !== null &&
        event.args[0] === saleIdentity(terms).saleId &&
        event.args[2] === terms.buyer &&
        event.args[3] === terms.grossPurchasePriceRaw &&
        receipt.from === terms.buyer &&
        receipt.to === terms.destinationMarket;
      const sale = decodedTuple(saleRead.decoded[0], 2);
      return {
        chainId: network.chainId,
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: BigInt(block.timestamp),
        finalized: true,
        marketCodeHash: keccak256(marketCode),
        tokenCodeHash: keccak256(tokenCode),
        terms: decodedTerms(sale[0]),
        state: decodedInteger(sale[1]),
        totalBound: decodedInteger(bound.decoded[0]),
        totalCredits: decodedInteger(credits.decoded[0]),
        totalLiabilities: decodedInteger(liabilities.decoded[0]),
        marketBalance: decodedInteger(balance.decoded[0]),
        fundingStatus: receipt.status,
        fundingBlockNumber: receipt.blockNumber,
        fundingMatches,
      };
    },
  };
}
