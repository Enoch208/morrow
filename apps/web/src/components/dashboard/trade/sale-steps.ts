import { stateLanguage, type SaleTerms } from "@morrow/protocol";
import type { SaleProgress } from "@morrow/sdk/browser";

export type SaleAction =
  "fund" | "assign" | "cancel" | "settle" | "recognize" | "withdraw" | "redeem" | "none";

export interface SaleStage {
  readonly headline: string;
  readonly detail: string;
  readonly action: SaleAction;
  readonly actor: "buyer" | "seller" | "anyone" | "you" | "nobody";
}

const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function settledStage(progress: SaleProgress, terms: SaleTerms, viewer: string): SaleStage {
  const assigned = progress.destinationState === 2n;
  if (progress.viewerCreditRaw > 0n)
    return {
      headline: assigned ? stateLanguage.SELLER_FUNDS_CLAIMABLE : stateLanguage.REFUND_CLAIMABLE,
      detail: "Your wallet has credits in the Creditcoin market. Withdrawals pay only the caller.",
      action: "withdraw",
      actor: "you",
    };
  const redeemable =
    !progress.claim.redeemed &&
    progress.claim.activeRound === 0n &&
    progress.sourceTimestamp >= progress.claim.maturity;
  if (redeemable)
    return {
      headline: "Payout unlocked",
      detail: `Anyone can trigger redemption; the vault pays only the current owner ${
        assigned ? "(the buyer)" : "(the seller)"
      }.`,
      action: "redeem",
      actor: "anyone",
    };
  const paidRole = assigned ? same(viewer, terms.seller) : same(viewer, terms.buyer);
  return {
    headline: progress.claim.redeemed
      ? "Payout redeemed on Sepolia"
      : assigned
        ? paidRole
          ? stateLanguage.SELLER_PAID
          : "Assignment recognized"
        : paidRole
          ? stateLanguage.REFUND_WITHDRAWN
          : "Cancellation recognized",
    detail: progress.claim.redeemed
      ? "The locked payout has been paid out at maturity."
      : "Waiting for maturity before the locked payout can be redeemed.",
    action: "none",
    actor: "nobody",
  };
}

export function saleStage(
  progress: SaleProgress,
  terms: SaleTerms,
  viewer: string,
  now: bigint,
): SaleStage {
  const { sourceState, destinationState } = progress;
  if (destinationState >= 2n) return settledStage(progress, terms, viewer);
  if (sourceState === 1n && destinationState === 0n)
    return progress.sourceTimestamp >= terms.assignBefore
      ? {
          headline: "Reservation expired unfunded",
          detail: "Anyone can cancel it on Sepolia so the claim can be sold again.",
          action: "cancel",
          actor: "anyone",
        }
      : now < terms.fundBefore
        ? {
            headline: stateLanguage.SOURCE_RESERVED,
            detail:
              "The buyer proves this reservation on Creditcoin and deposits the exact price in one transaction.",
            action: "fund",
            actor: "buyer",
          }
        : {
            headline: "Funding window closed",
            detail:
              "The market no longer admits deposits; cancellation opens at the assignment deadline.",
            action: "none",
            actor: "nobody",
          };
  if (sourceState === 1n && destinationState === 1n)
    return progress.sourceTimestamp >= terms.assignBefore
      ? {
          headline: "Assignment deadline passed",
          detail: "Cancel on Sepolia, then prove the cancellation to refund the buyer in full.",
          action: "cancel",
          actor: "anyone",
        }
      : {
          headline: stateLanguage.DESTINATION_FUNDED,
          detail:
            "The buyer's money is locked. The seller runs the live preflight and assigns the claim on Sepolia.",
          action: "assign",
          actor: "seller",
        };
  if (sourceState === 2n && destinationState === 1n)
    return {
      headline: stateLanguage.ASSIGNED_ON_SOURCE,
      detail:
        "Anyone can prove the assignment on Creditcoin to release the seller's funds and fee.",
      action: "settle",
      actor: "anyone",
    };
  if (sourceState === 3n && destinationState === 1n)
    return {
      headline: "Cancelled on source",
      detail: "Anyone can prove the cancellation on Creditcoin to refund the buyer, with no fee.",
      action: "recognize",
      actor: "anyone",
    };
  if (sourceState === 3n)
    return {
      headline: "Cancelled before funding",
      detail: "No buyer money was deposited; the seller can reserve a new round.",
      action: "none",
      actor: "nobody",
    };
  return {
    headline: stateLanguage.EVIDENCE_UNAVAILABLE,
    detail: "The two chains disagree with every known state pair. Nothing is actionable.",
    action: "none",
    actor: "nobody",
  };
}

export function viewerMayAct(stage: SaleStage, terms: SaleTerms, viewer: string): boolean {
  if (stage.actor === "anyone" || stage.actor === "you") return true;
  if (stage.actor === "buyer") return same(viewer, terms.buyer);
  if (stage.actor === "seller") return same(viewer, terms.seller);
  return false;
}
