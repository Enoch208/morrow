import { getAddress } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import {
  prepareBrowserAssignment,
  prepareBrowserCancellation,
  prepareBrowserCancellationRecognition,
  prepareBrowserClaim,
  prepareBrowserClaimApproval,
  prepareBrowserFaucetDrip,
  prepareBrowserFunding,
  prepareBrowserFundingApproval,
  prepareBrowserRedemption,
  prepareBrowserReservation,
  prepareBrowserSaleProof,
  prepareBrowserSettlement,
  prepareBrowserWithdrawal,
  readClaimState,
  readMarketRules,
  readSaleProgress,
} from "./browser.ts";
import type { BrowserActionOptions } from "./browser.ts";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { encodeTerms } from "./canonical.ts";
import { ConfigurationError, proverEndpoints } from "./environment.ts";
import { minedTrade, tradeTerms } from "./trade-log.ts";
import type { TradeStep } from "./trade-log.ts";

import { tradeFaceValueRaw, tradePriceRaw } from "./trade-claim.ts";
const maturitySeconds = 10_800n;
const fundSeconds = 3_600n;
const assignSeconds = 7_200n;

export const tradeSigner = {
  "drip-buyer": "BUYER",
  "approve-claim": "PAYER",
  create: "PAYER",
  reserve: "SELLER",
  "approve-fund": "BUYER",
  fund: "BUYER",
  assign: "SELLER",
  settle: "SELLER",
  "withdraw-seller": "SELLER",
  cancel: "SELLER",
  recognize: "BUYER",
  "withdraw-buyer": "BUYER",
  redeem: "BUYER",
} as const satisfies Record<TradeStep, "PAYER" | "SELLER" | "BUYER">;

export function tradeChain(step: TradeStep): bigint {
  return [
    "drip-buyer",
    "approve-fund",
    "fund",
    "settle",
    "withdraw-seller",
    "recognize",
    "withdraw-buyer",
  ].includes(step)
    ? 102031n
    : 11155111n;
}

function claimIdOf(records: readonly Record<string, unknown>[]): bigint {
  const row = minedTrade(records, "create");
  if (typeof row.claimId !== "string") throw new ConfigurationError("Create row lacks claimId");
  return BigInt(row.claimId);
}

async function reservationTerms(
  records: readonly Record<string, unknown>[],
  options: BrowserActionOptions,
): Promise<SaleTerms> {
  const claimId = claimIdOf(records);
  const [{ claim, timestamp }, rules] = await Promise.all([
    readClaimState(claimId, options),
    readMarketRules(options),
  ]);
  const created = minedTrade(records, "create");
  if (
    claim.sourceFaceValueRaw !== tradeFaceValueRaw ||
    String(claim.maturity) !== String(created.maturity) ||
    claim.originalBeneficiary !== campaignActors.SELLER
  )
    throw new ConfigurationError("Claim on chain differs from the created payout");
  return {
    protocolVersion: 1n,
    sourceEvmChainId: 11155111n,
    sourceVault: campaignContracts.vault.address,
    claimId,
    round: claim.latestRound + 1n,
    destinationEvmChainId: 102031n,
    destinationMarket: campaignContracts.market.address,
    seller: campaignActors.SELLER,
    buyer: campaignActors.BUYER,
    sourceToken: claim.sourceToken,
    sourceFaceValueRaw: claim.sourceFaceValueRaw,
    maturity: claim.maturity,
    settlementToken: campaignContracts.settlementToken.address,
    grossPurchasePriceRaw: tradePriceRaw,
    feeBps: rules.feeBps,
    feeRecipient: getAddress(rules.feeRecipient) as SaleTerms["feeRecipient"],
    fundBefore: timestamp + fundSeconds,
    assignBefore: timestamp + assignSeconds,
  };
}

async function proofInput(
  terms: SaleTerms,
  hash: string,
  event: "reserve" | "assign" | "cancel",
  options: BrowserActionOptions,
) {
  const result = await prepareBrowserSaleProof(terms, hash, event, {
    ...options,
    proverUrl: proverEndpoints[0],
  });
  return { proof: result.proof, sourceTransactionHash: hash };
}

export async function prepareTradeStep(
  step: TradeStep,
  actor: string,
  records: readonly Record<string, unknown>[],
  options: BrowserActionOptions,
) {
  const chain = tradeChain(step);
  if (step === "drip-buyer")
    return { prepared: await prepareBrowserFaucetDrip("settlement", actor, chain, options) };
  if (step === "approve-claim" || step === "create") {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const request = {
      faceValueRaw: tradeFaceValueRaw,
      beneficiary: campaignActors.SELLER,
      maturity: now + maturitySeconds,
    };
    if (step === "create") {
      const prepared = await prepareBrowserClaim(request, actor, chain, options);
      return {
        prepared,
        context: { expectedClaimId: prepared.expectedClaimId, maturity: request.maturity },
      };
    }
    const approval = await prepareBrowserClaimApproval(request, actor, chain, options);
    if (approval.status === "already-approved") return { skip: "Vault allowance already exact" };
    return { prepared: approval.prepared };
  }
  if (step === "reserve") {
    const terms = await reservationTerms(records, options);
    const prepared = await prepareBrowserReservation(terms, actor, chain, options);
    return { prepared, context: { canonicalTerms: encodeTerms(terms), saleId: prepared.saleId } };
  }
  const terms = tradeTerms(records);
  if (step === "approve-fund") {
    const approval = await prepareBrowserFundingApproval(terms, actor, chain, options);
    if (approval.status === "already-approved") return { skip: "Market allowance already exact" };
    return { prepared: approval.prepared };
  }
  if (step === "fund") {
    const input = await proofInput(
      terms,
      minedTrade(records, "reserve").transactionHash,
      "reserve",
      options,
    );
    return { prepared: await prepareBrowserFunding(terms, actor, chain, input, options) };
  }
  if (step === "assign") {
    const progress = await readSaleProgress(terms, actor, options);
    if (!progress.fundingHash) throw new ConfigurationError("Funding transaction not found");
    return {
      prepared: await prepareBrowserAssignment(terms, actor, chain, {
        ...options,
        fundingHash: progress.fundingHash,
      }),
    };
  }
  if (step === "settle") {
    const input = await proofInput(
      terms,
      minedTrade(records, "assign").transactionHash,
      "assign",
      options,
    );
    return { prepared: await prepareBrowserSettlement(terms, actor, chain, input, options) };
  }
  if (step === "withdraw-seller" || step === "withdraw-buyer")
    return { prepared: await prepareBrowserWithdrawal(actor, chain, options) };
  if (step === "cancel")
    return { prepared: await prepareBrowserCancellation(terms, actor, chain, options) };
  if (step === "recognize") {
    const input = await proofInput(
      terms,
      minedTrade(records, "cancel").transactionHash,
      "cancel",
      options,
    );
    return {
      prepared: await prepareBrowserCancellationRecognition(terms, actor, chain, input, options),
    };
  }
  return { prepared: await prepareBrowserRedemption(terms.claimId, actor, chain, options) };
}
