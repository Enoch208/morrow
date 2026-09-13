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

function assignStep(claim: LiveClaim): NextStep {
  const base = { name: "Assign sale", who: "Seller only" };
  if (claim.roundState === "ASSIGNED")
    return { ...base, status: "done", reason: "Assigned on source" };
  if (claim.roundState !== "RESERVED")
    return { ...base, status: "unavailable", reason: `Round is ${claim.roundState.toLowerCase()}` };
  return {
    ...base,
    status: "unavailable",
    reason: "Requires the SDK seller preflight, not yet in the browser",
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
    assignStep(claim),
    cancelStep(claim, terms, now),
    outcomeStep(claim),
    redeemStep(claim, terms, now),
  ];
}
