import type { SaleTerms } from "@morrow/protocol";
import type { LiveClaim } from "@/lib/chain/live-reads";
import { utcDateTimeFromUnix } from "@/lib/format/display";

export type StepStatus = "done" | "eligible" | "unavailable";

export interface NextStep {
  readonly name: string;
  readonly who: string;
  readonly status: StepStatus;
  readonly reason: string;
}

const operatorNote = "Eligible · submitted by the campaign operator while the live campaign runs";

function assignStep(claim: LiveClaim, terms: SaleTerms, now: bigint): NextStep {
  const base = { name: "Assign sale", who: "Seller only" };
  if (claim.roundState === "ASSIGNED")
    return { ...base, status: "done", reason: "Assigned on source" };
  if (claim.roundState !== "RESERVED")
    return { ...base, status: "unavailable", reason: `Round is ${claim.roundState.toLowerCase()}` };
  if (now >= terms.assignBefore)
    return { ...base, status: "unavailable", reason: "Assignment window has closed" };
  if (claim.saleState !== "BOUND")
    return {
      ...base,
      status: "unavailable",
      reason:
        now >= terms.fundBefore
          ? "Funding window closed with no buyer deposit"
          : "Waiting for the buyer to fund on Creditcoin",
    };
  return {
    ...base,
    status: "eligible",
    reason: `Seller signs after the preflight passes · before ${utcDateTimeFromUnix(terms.assignBefore)}`,
  };
}

function cancelStep(claim: LiveClaim, terms: SaleTerms, now: bigint): NextStep {
  const base = { name: "Cancel expired sale", who: "Anyone" };
  if (claim.roundState === "CANCELLED")
    return { ...base, status: "done", reason: "Cancelled on source" };
  if (claim.roundState === "ASSIGNED")
    return { ...base, status: "unavailable", reason: "Round is assigned; cancellation is refused" };
  if (claim.roundState === "RESERVED" && now >= terms.assignBefore)
    return { ...base, status: "eligible", reason: operatorNote };
  return {
    ...base,
    status: "unavailable",
    reason: `Opens at ${utcDateTimeFromUnix(terms.assignBefore)}`,
  };
}

function outcomeStep(claim: LiveClaim): NextStep {
  const base = { name: "Submit outcome proof", who: "Anyone" };
  if (claim.saleState === "ASSIGNED_CLAIMABLE" || claim.saleState === "CANCELLED_CLAIMABLE")
    return { ...base, status: "done", reason: "Outcome recognized on Creditcoin" };
  if (claim.saleState === "ABSENT" && claim.roundState !== "RESERVED")
    return { ...base, status: "unavailable", reason: "Round was never funded; nothing to settle" };
  if (claim.saleState === "BOUND" && claim.roundState !== "RESERVED")
    return { ...base, status: "eligible", reason: operatorNote };
  return {
    ...base,
    status: "unavailable",
    reason: "Waiting for a source assignment or cancellation",
  };
}

function redeemStep(claim: LiveClaim, terms: SaleTerms, now: bigint): NextStep {
  const base = { name: "Redeem at maturity", who: "Anyone · pays the beneficiary" };
  if (claim.redeemed)
    return { ...base, status: "done", reason: "Face value paid to the beneficiary" };
  if (now < terms.maturity)
    return {
      ...base,
      status: "unavailable",
      reason: `Matures ${utcDateTimeFromUnix(terms.maturity)}`,
    };
  if (claim.roundState === "RESERVED")
    return { ...base, status: "unavailable", reason: "Cancel the expired reservation first" };
  return { ...base, status: "eligible", reason: operatorNote };
}

export function nextSteps(claim: LiveClaim, terms: SaleTerms, now: bigint): readonly NextStep[] {
  return [
    assignStep(claim, terms, now),
    cancelStep(claim, terms, now),
    outcomeStep(claim),
    redeemStep(claim, terms, now),
  ];
}
