import { getAddress, ZeroAddress } from "ethers";
import type { Address, Claim, PreparedTransaction, SaleTerms } from "@morrow/protocol";
import { campaignContracts } from "./campaign-config.ts";
import { encodeTerms } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export interface WalletIdentityProvider {
  request(args: { readonly method: string }): Promise<unknown>;
}

export function actionAddress(value: string): Address {
  return getAddress(value) as Address;
}

export function assertActor(
  actor: string,
  expected: string,
  actualChain: bigint,
  requiredChain: bigint,
): void {
  if (
    actionAddress(actor) !== actionAddress(expected) ||
    actionAddress(actor) === ZeroAddress ||
    actualChain !== requiredChain
  )
    throw new ConfigurationError("Unexpected signing account or network");
}

export async function confirmPreparedWallet(
  provider: WalletIdentityProvider,
  prepared: PreparedTransaction,
): Promise<void> {
  const [chain, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (
    typeof chain !== "string" ||
    !/^0x[0-9a-f]+$/i.test(chain) ||
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string"
  )
    throw new ConfigurationError("Wallet did not return a valid chain and account");
  assertActor(accounts[0], prepared.expectedSigner, BigInt(chain), prepared.chainId);
  const checked = Date.parse(prepared.checkedAt);
  const now = Date.now();
  if (
    !Number.isFinite(checked) ||
    checked > now ||
    now - checked > 120000 ||
    (prepared.validBefore !== undefined && BigInt(Math.floor(now / 1000)) >= prepared.validBefore)
  )
    throw new ConfigurationError("Prepared action expired; repeat the live preflight");
}

export function assertBrowserTerms(terms: SaleTerms): void {
  encodeTerms(terms);
  if (
    terms.protocolVersion !== 1n ||
    terms.sourceEvmChainId !== 11155111n ||
    terms.destinationEvmChainId !== 102031n ||
    actionAddress(terms.sourceVault) !== campaignContracts.vault.address ||
    actionAddress(terms.destinationMarket) !== campaignContracts.market.address ||
    actionAddress(terms.sourceToken) !== campaignContracts.sourceToken.address ||
    actionAddress(terms.settlementToken) !== campaignContracts.settlementToken.address ||
    terms.claimId <= 0n ||
    terms.round <= 0n ||
    terms.sourceFaceValueRaw <= 0n ||
    terms.grossPurchasePriceRaw <= 0n ||
    terms.feeBps < 0n ||
    terms.feeBps > 100n ||
    terms.fundBefore <= 0n ||
    terms.fundBefore > terms.assignBefore ||
    terms.assignBefore >= terms.maturity ||
    [terms.seller, terms.buyer, terms.feeRecipient].some(
      (actor) => actionAddress(actor) === ZeroAddress,
    ) ||
    [terms.sourceVault, terms.destinationMarket].includes(actionAddress(terms.buyer))
  )
    throw new ConfigurationError("Sale terms differ from supported deployment or economics");
}

export function assertReservationClaim(claim: Claim, terms: SaleTerms, timestamp: bigint): void {
  if (
    claim.claimId !== terms.claimId ||
    claim.activeRound !== 0n ||
    claim.latestRound + 1n !== terms.round ||
    claim.redeemed ||
    claim.successfulSale ||
    actionAddress(claim.currentBeneficiary) !== actionAddress(terms.seller) ||
    actionAddress(claim.sourceToken) !== actionAddress(terms.sourceToken) ||
    claim.sourceFaceValueRaw !== terms.sourceFaceValueRaw ||
    claim.maturity !== terms.maturity ||
    timestamp >= terms.assignBefore ||
    timestamp >= terms.fundBefore
  )
    throw new ConfigurationError("Claim is not reservable with these exact terms");
}
