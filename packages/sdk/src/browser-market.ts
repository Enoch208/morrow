import type { JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { decodedInteger, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";
import { tradeRead } from "./trade-contracts.ts";

export async function browserMarketSnapshot(rpc: JsonRpcProvider, terms: SaleTerms, block: number) {
  const [read, bound, credits, liabilities, balance, allowance, buyerBalance] = await Promise.all([
    tradeRead(rpc, "market", "getSale", [saleIdentity(terms).saleId], block),
    tradeRead(rpc, "market", "totalBound", [], block),
    tradeRead(rpc, "market", "totalCredits", [], block),
    tradeRead(rpc, "market", "totalLiabilities", [], block),
    tradeRead(rpc, "settlementToken", "balanceOf", [terms.destinationMarket], block),
    tradeRead(rpc, "settlementToken", "allowance", [terms.buyer, terms.destinationMarket], block),
    tradeRead(rpc, "settlementToken", "balanceOf", [terms.buyer], block),
  ]);
  const sale = decodedTuple(read.decoded[0], 2);
  const state = decodedInteger(sale[1]);
  if (state !== 0n && encodeTerms(decodedTerms(sale[0])) !== encodeTerms(terms))
    throw new ConfigurationError("Destination canonical sale differs");
  const totalBound = decodedInteger(bound.decoded[0]);
  const totalCredits = decodedInteger(credits.decoded[0]);
  const totalLiabilities = decodedInteger(liabilities.decoded[0]);
  if (
    totalLiabilities !== totalBound + totalCredits ||
    decodedInteger(balance.decoded[0]) < totalLiabilities
  )
    throw new ConfigurationError("Destination accounting or solvency mismatch");
  return {
    state,
    totalBound,
    allowance: decodedInteger(allowance.decoded[0]),
    buyerBalance: decodedInteger(buyerBalance.decoded[0]),
  };
}

export function assertFundingSnapshot(
  snapshot: Awaited<ReturnType<typeof browserMarketSnapshot>>,
  terms: SaleTerms,
): void {
  if (
    snapshot.state !== 0n ||
    snapshot.allowance !== terms.grossPurchasePriceRaw ||
    snapshot.buyerBalance < terms.grossPurchasePriceRaw
  )
    throw new ConfigurationError(
      "Sale must be absent with exact buyer allowance and sufficient funds",
    );
}

export function assertSettlementSnapshot(
  snapshot: Awaited<ReturnType<typeof browserMarketSnapshot>>,
  terms: SaleTerms,
): void {
  if (snapshot.state !== 1n || snapshot.totalBound < terms.grossPurchasePriceRaw)
    throw new ConfigurationError("Exact sale is not BOUND with covered principal");
}
