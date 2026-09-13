import type { SaleIdentity, SaleTerms } from "@morrow/protocol";
import { campaignContracts } from "./campaign-config.ts";
import { encodeTerms, quoteEconomics, saleIdentity } from "./canonical.ts";
import { contractArtifact } from "./artifact.ts";
import { ConfigurationError } from "./environment.ts";

interface BlockRead {
  readonly chainId: bigint;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly timestamp: bigint;
}

export interface SourcePreflightRead extends BlockRead, SaleIdentity {
  readonly vaultCodeHash: string;
  readonly terms: SaleTerms;
  readonly state: bigint;
  readonly activeRound: bigint;
  readonly beneficiary: string;
  readonly faceValueRaw: bigint;
  readonly maturity: bigint;
  readonly sourceToken: string;
  readonly successfulSale: boolean;
  readonly redeemed: boolean;
  readonly vaultBalance: bigint;
  readonly totalBacking: bigint;
}

export interface DestinationPreflightRead extends BlockRead {
  readonly finalized: boolean;
  readonly marketCodeHash: string;
  readonly tokenCodeHash: string;
  readonly terms: SaleTerms;
  readonly state: bigint;
  readonly totalBound: bigint;
  readonly totalCredits: bigint;
  readonly totalLiabilities: bigint;
  readonly marketBalance: bigint;
  readonly fundingStatus: number;
  readonly fundingBlockNumber: number;
  readonly fundingMatches: boolean;
}

export interface PreflightReaders {
  source(): Promise<SourcePreflightRead>;
  destination(): Promise<DestinationPreflightRead>;
}

function fresh(read: BlockRead, now: bigint): void {
  if (
    !Number.isSafeInteger(read.blockNumber) ||
    read.blockNumber < 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(read.blockHash)
  )
    throw new ConfigurationError("Invalid preflight block identity");
  if (now - read.timestamp > 120n || read.timestamp - now > 30n)
    throw new ConfigurationError("Stale or inconsistent chain timestamp");
}

function validateSource(read: SourcePreflightRead, terms: SaleTerms, now: bigint): void {
  fresh(read, now);
  const identity = saleIdentity(terms);
  if (
    read.chainId !== terms.sourceEvmChainId ||
    read.vaultCodeHash !== campaignContracts.vault.codeHash
  )
    throw new ConfigurationError("Source deployment provenance mismatch");
  if (
    read.state !== 1n ||
    read.activeRound !== terms.round ||
    read.beneficiary.toLowerCase() !== terms.seller.toLowerCase() ||
    read.successfulSale ||
    read.redeemed
  )
    throw new ConfigurationError("Source reservation is not currently assignable");
  if (read.timestamp >= terms.assignBefore || now >= terms.assignBefore)
    throw new ConfigurationError("Source assignment deadline reached");
  if (
    read.faceValueRaw !== terms.sourceFaceValueRaw ||
    read.maturity !== terms.maturity ||
    read.sourceToken.toLowerCase() !== terms.sourceToken.toLowerCase() ||
    read.vaultBalance < read.totalBacking ||
    read.totalBacking < terms.sourceFaceValueRaw
  )
    throw new ConfigurationError("Source claim fields or backing mismatch");
  if (
    encodeTerms(read.terms) !== encodeTerms(terms) ||
    read.saleId !== identity.saleId ||
    read.termsHash !== identity.termsHash ||
    read.claimKey !== identity.claimKey
  )
    throw new ConfigurationError("Source canonical sale mismatch");
}

export async function prepareAssignment(
  terms: SaleTerms,
  sellerAddress: string,
  connectedSourceChain: bigint,
  readers: PreflightReaders,
  clock: () => bigint = () => BigInt(Math.floor(Date.now() / 1000)),
) {
  if (
    connectedSourceChain !== 11155111n ||
    sellerAddress.toLowerCase() !== terms.seller.toLowerCase()
  )
    throw new ConfigurationError("Wrong seller account or source chain");
  if (
    terms.sourceVault !== campaignContracts.vault.address ||
    terms.destinationMarket !== campaignContracts.market.address ||
    terms.sourceToken !== campaignContracts.sourceToken.address ||
    terms.settlementToken !== campaignContracts.settlementToken.address ||
    terms.sourceEvmChainId !== 11155111n ||
    terms.destinationEvmChainId !== 102031n ||
    terms.protocolVersion !== 1n
  )
    throw new ConfigurationError("Sale differs from pinned deployment manifest");
  const sourceBefore = await readers.source();
  validateSource(sourceBefore, terms, clock());
  const destination = await readers.destination();
  fresh(destination, clock());
  if (
    !destination.finalized ||
    destination.fundingStatus !== 1 ||
    destination.fundingBlockNumber > destination.blockNumber ||
    !destination.fundingMatches
  )
    throw new ConfigurationError(
      "Funding transaction is missing, reverted, unfinalized or mismatched",
    );
  if (
    destination.chainId !== 102031n ||
    destination.marketCodeHash !== campaignContracts.market.codeHash ||
    destination.tokenCodeHash !== campaignContracts.settlementToken.codeHash
  )
    throw new ConfigurationError("Destination deployment provenance mismatch");
  if (destination.state !== 1n || encodeTerms(destination.terms) !== encodeTerms(terms))
    throw new ConfigurationError("Exact destination sale is not BOUND");
  if (
    destination.totalLiabilities !== destination.totalBound + destination.totalCredits ||
    destination.totalBound < terms.grossPurchasePriceRaw ||
    destination.marketBalance < destination.totalLiabilities
  )
    throw new ConfigurationError("Destination liabilities are not covered");
  const sourceAfter = await readers.source();
  validateSource(sourceAfter, terms, clock());
  if (
    sourceAfter.blockNumber < sourceBefore.blockNumber ||
    (sourceAfter.blockNumber === sourceBefore.blockNumber &&
      sourceAfter.blockHash !== sourceBefore.blockHash)
  )
    throw new ConfigurationError("Source RPC views disagree");
  const identity = saleIdentity(terms);
  const economics = quoteEconomics(terms.grossPurchasePriceRaw, terms.feeBps);
  return {
    to: terms.sourceVault,
    chainId: 11155111n,
    data: contractArtifact("FundedPaymentVault").abi.encodeFunctionData("assignSale", [
      terms.claimId,
      terms.round,
      identity.termsHash,
    ]),
    ...identity,
    ...economics,
    sourceBlock: sourceAfter.blockNumber,
    sourceBlockHash: sourceAfter.blockHash,
    destinationBlock: destination.blockNumber,
    destinationBlockHash: destination.blockHash,
  };
}
