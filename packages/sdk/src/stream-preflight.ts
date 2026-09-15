import type { JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedAddress, decodedInteger, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";
import { compiledRuntime, maskImmutables } from "./runtime.ts";
import { streamMarketDeploymentBlock } from "./stream-config.ts";
import { vaultInterface } from "./stream-setup.ts";

export interface StreamAssignmentRead {
  readonly now: bigint;
  readonly destinationChainId: bigint;
  readonly marketRuntimeMatches: boolean;
  readonly vaultRuntimeMatches: boolean;
  readonly marketPins: readonly [string, string, string, bigint, string];
  readonly destinationTerms: SaleTerms;
  readonly destinationState: bigint;
  readonly totalBound: bigint;
  readonly totalCredits: bigint;
  readonly totalLiabilities: bigint;
  readonly marketBalance: bigint;
  readonly fundingFinalized: boolean;
  readonly sourceTerms: SaleTerms;
  readonly sourceState: bigint;
  readonly activeRound: bigint;
}

export function validateStreamAssignment(read: StreamAssignmentRead, terms: SaleTerms): void {
  const [vault, token, settlement, feeBps, feeRecipient] = read.marketPins;
  if (
    read.destinationChainId !== 102031n ||
    !read.marketRuntimeMatches ||
    !read.vaultRuntimeMatches
  )
    throw new ConfigurationError("Stream deployment provenance mismatch");
  if (
    vault !== terms.sourceVault ||
    token !== terms.sourceToken ||
    settlement !== terms.settlementToken ||
    feeBps !== terms.feeBps ||
    feeRecipient !== terms.feeRecipient
  )
    throw new ConfigurationError("Stream market immutables differ from sale terms");
  if (read.destinationState !== 1n || encodeTerms(read.destinationTerms) !== encodeTerms(terms))
    throw new ConfigurationError("Exact destination sale is not BOUND");
  if (
    read.totalLiabilities !== read.totalBound + read.totalCredits ||
    read.marketBalance < read.totalLiabilities ||
    read.totalBound < terms.grossPurchasePriceRaw
  )
    throw new ConfigurationError("Destination liabilities are not covered");
  if (!read.fundingFinalized) throw new ConfigurationError("Funding transaction is not finalized");
  if (
    read.sourceState !== 1n ||
    read.activeRound !== terms.round ||
    encodeTerms(read.sourceTerms) !== encodeTerms(terms)
  )
    throw new ConfigurationError("Source round is not the reserved sale");
  if (read.now >= terms.assignBefore) throw new ConfigurationError("Assignment deadline reached");
}

async function runtimeMatches(rpc: JsonRpcProvider, name: string, address: string, block: number) {
  const compiled = compiledRuntime(name);
  return (
    maskImmutables(await rpc.getCode(address, block), compiled.ranges) ===
    maskImmutables(compiled.code, compiled.ranges)
  );
}

async function marketCall(
  rpc: JsonRpcProvider,
  market: string,
  method: string,
  args: unknown[],
  block: number,
) {
  const raw = await rpc.call({
    to: market,
    data: contractInterfaces.market.encodeFunctionData(method, args),
    blockTag: block,
  });
  return contractInterfaces.market.decodeFunctionResult(method, raw)[0] as unknown;
}

export async function readStreamAssignment(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  terms: SaleTerms,
): Promise<StreamAssignmentRead> {
  const [finalized, sourceBlock, network] = await Promise.all([
    destination.getBlock("finalized"),
    source.getBlock("latest"),
    destination.getNetwork(),
  ]);
  if (!finalized || !sourceBlock) throw new ConfigurationError("Preflight blocks unavailable");
  const market = terms.destinationMarket;
  const saleId = saleIdentity(terms).saleId;
  const funded = contractInterfaces.market.getEvent("ReservationFunded")?.topicHash;
  const [pins, sale, bound, credits, liabilities, balance, logs, round, claim, marketOk, vaultOk] =
    await Promise.all([
      Promise.all(
        ["SOURCE_VAULT", "SOURCE_TOKEN", "SETTLEMENT_TOKEN", "FEE_BPS", "FEE_RECIPIENT"].map(
          (name) => marketCall(destination, market, name, [], finalized.number),
        ),
      ),
      marketCall(destination, market, "getSale", [saleId], finalized.number),
      marketCall(destination, market, "totalBound", [], finalized.number),
      marketCall(destination, market, "totalCredits", [], finalized.number),
      marketCall(destination, market, "totalLiabilities", [], finalized.number),
      destination.call({
        to: terms.settlementToken,
        data: contractInterfaces.settlementToken.encodeFunctionData("balanceOf", [market]),
        blockTag: finalized.number,
      }),
      destination.getLogs({
        address: market,
        topics: [funded ?? null, saleId],
        fromBlock: streamMarketDeploymentBlock,
        toBlock: finalized.number,
      }),
      source.call({
        to: terms.sourceVault,
        data: vaultInterface.encodeFunctionData("getRound", [terms.claimId, terms.round]),
        blockTag: sourceBlock.number,
      }),
      source.call({
        to: terms.sourceVault,
        data: vaultInterface.encodeFunctionData("getClaim", [terms.claimId]),
        blockTag: sourceBlock.number,
      }),
      runtimeMatches(destination, "MorrowMarket", market, finalized.number),
      runtimeMatches(source, "StreamPaymentVault", terms.sourceVault, sourceBlock.number),
    ]);
  const saleTuple = decodedTuple(sale, 2);
  const roundTuple = decodedTuple(vaultInterface.decodeFunctionResult("getRound", round)[0], 4);
  const claimTuple = decodedTuple(vaultInterface.decodeFunctionResult("getClaim", claim)[0], 10);
  const receipt =
    logs.length === 1 && logs[0]
      ? await destination.getTransactionReceipt(logs[0].transactionHash)
      : null;
  return {
    now: BigInt(sourceBlock.timestamp),
    destinationChainId: network.chainId,
    marketRuntimeMatches: marketOk,
    vaultRuntimeMatches: vaultOk,
    marketPins: [
      decodedAddress(pins[0]),
      decodedAddress(pins[1]),
      decodedAddress(pins[2]),
      decodedInteger(pins[3]),
      decodedAddress(pins[4]),
    ],
    destinationTerms: decodedTerms(saleTuple[0]),
    destinationState: decodedInteger(saleTuple[1]),
    totalBound: decodedInteger(bound),
    totalCredits: decodedInteger(credits),
    totalLiabilities: decodedInteger(liabilities),
    marketBalance: decodedInteger(
      contractInterfaces.settlementToken.decodeFunctionResult("balanceOf", balance)[0],
    ),
    fundingFinalized:
      receipt?.status === 1 &&
      receipt.from === terms.buyer &&
      receipt.blockNumber <= finalized.number,
    sourceTerms: decodedTerms(roundTuple[0]),
    sourceState: decodedInteger(roundTuple[1]),
    activeRound: decodedInteger(claimTuple[5]),
  };
}
