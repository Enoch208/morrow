import type { CampaignManifest } from "./manifest-types.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { referenceIdentity } from "./index.ts";

const commitments = {
  gate: {
    claimId: "1",
    saleId: "0xf1d9e03ea44e90946e61981fd385a0acdf90104aa05c8b2f36916d0043e1435a",
  },
  a: { claimId: "2", saleId: "0x68c0b70a12bbbec19f1413c90de99efc6336c6f0f002dc397e1955a672d61692" },
  b: { claimId: "3", saleId: "0x5075887af502c30798bad388f68596e1f2144e38e1cf19f2851eb10629c7e058" },
} as const;

export function requireCanonicalCampaign(manifest: CampaignManifest): void {
  const expected = commitments[manifest.campaignId];
  if (
    manifest.terms.claimId !== expected.claimId ||
    manifest.terms.round !== "1" ||
    referenceIdentity(manifest.terms).saleId !== expected.saleId ||
    manifest.identity.saleId !== expected.saleId
  )
    throw new EvidenceError("Release manifest is not its canonical gate/A/B sale");
}

export function requireReleaseSet(manifests: readonly CampaignManifest[]): void {
  if (manifests.length !== 3)
    throw new EvidenceError("Release evidence requires exactly three manifests");
  if (new Set(manifests.map((manifest) => manifest.campaignId)).size !== 3)
    throw new EvidenceError("Release evidence requires distinct gate, a and b campaigns");
  manifests.forEach(requireCanonicalCampaign);
}

export function requireTerminalCampaign(manifest: CampaignManifest): string[] {
  requireCanonicalCampaign(manifest);
  const assigned = manifest.campaignId === "a",
    expected = assigned ? 2 : 3;
  if (
    manifest.actualOutcome.sourceRoundState !== expected ||
    manifest.actualOutcome.destinationState !== expected ||
    !manifest.actualOutcome.redeemed
  )
    throw new EvidenceError("Canonical campaign terminal outcome or redemption is missing");
  const actions = [
    "create",
    "reserve",
    "fund",
    assigned ? "assign" : "cancel",
    assigned ? "settle" : "refund",
    "withdraw",
    "redeem",
  ].map((operation) => `${manifest.campaignId}-${operation}`);
  if (assigned) actions.push("withdraw-fee");
  for (const action of actions) {
    const transactions = manifest.transactions.filter(
      (item) => item.action === action && item.receiptStatus === 1,
    );
    if (transactions.length !== 1)
      throw new EvidenceError(`Missing unique successful ${action} transaction`);
    if (
      action.includes("withdraw") &&
      !manifest.withdrawals.some(
        (item) =>
          item.transactionHash === transactions[0]?.transactionHash &&
          item.action === action &&
          item.receiptStatus === 1,
      )
    )
      throw new EvidenceError(`Missing successful ${action} withdrawal evidence`);
  }
  return actions;
}

export function assertReleaseTiming(
  manifest: CampaignManifest,
  timestamps: Readonly<Record<string, number>>,
) {
  const required = requireTerminalCampaign(manifest);
  for (const action of required)
    if (!Number.isSafeInteger(timestamps[action]) || (timestamps[action] ?? -1) < 0)
      throw new EvidenceError(`Missing actual canonical block timestamp for ${action}`);
  const time = (action: string) => BigInt(timestamps[`${manifest.campaignId}-${action}`] ?? -1);
  const deadline = BigInt(manifest.terms.assignBefore ?? "-1"),
    maturity = BigInt(manifest.terms.maturity ?? "-1");
  if (
    time("create") >= maturity ||
    time("reserve") >= deadline ||
    time("fund") >= BigInt(manifest.terms.fundBefore ?? "-1") ||
    time("redeem") < maturity
  )
    throw new EvidenceError("Campaign admission or maturity timing mismatch");
  if (manifest.campaignId === "a") {
    if (time("assign") >= deadline)
      throw new EvidenceError("A source assignment was not before its deadline");
    if (
      time("settle") <= deadline ||
      time("settle") <= maturity ||
      time("settle") <= time("redeem")
    )
      throw new EvidenceError(
        "A late settlement does not follow cutoff, maturity and actual redemption",
      );
    if (
      time("withdraw") < time("settle") ||
      BigInt(timestamps["withdraw-fee"] ?? -1) < time("settle")
    )
      throw new EvidenceError("A withdrawal timestamp preceded settlement");
    return {
      assignmentTimestamp: time("assign"),
      assignBefore: deadline,
      maturity,
      redemptionTimestamp: time("redeem"),
      settlementTimestamp: time("settle"),
      settlementAfterAssignBeforeSeconds: time("settle") - deadline,
      settlementAfterMaturitySeconds: time("settle") - maturity,
      lateAssignmentSettlementVerified: true,
    };
  }
  if (
    time("cancel") < deadline ||
    time("refund") < time("cancel") ||
    time("withdraw") < time("refund")
  )
    throw new EvidenceError("Cancellation/refund/withdrawal chronology mismatch");
  return {
    cancellationTimestamp: time("cancel"),
    assignBefore: deadline,
    maturity,
    refundTimestamp: time("refund"),
    withdrawalTimestamp: time("withdraw"),
    redemptionTimestamp: time("redeem"),
  };
}
