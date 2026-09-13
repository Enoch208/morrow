import { EvidenceError } from "./checker-rpc.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import { checkedArtifact, record, string } from "./evidence-files.ts";
import { referenceEconomics, referenceIdentity } from "./index.ts";
import { requireCanonicalCampaign } from "./release-campaign-policy.ts";
import { requireMovement } from "./balance-history.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import type { verifyManifest } from "./manifest-verify.ts";

export type SubmissionVerification = Pick<
  Awaited<ReturnType<typeof verifyManifest>>,
  "campaignId" | "saleId" | "paymentChecks"
>;

export function submissionClaimTerms(manifest: CampaignManifest) {
  if (manifest.campaignId !== "a")
    throw new EvidenceError("Submission claim must be canonical Claim A");
  requireCanonicalCampaign(manifest);
  const identity = referenceIdentity(manifest.terms);
  for (const key of ["encodedTerms", "saleId", "termsHash", "claimKey"] as const)
    if (manifest.identity[key] !== identity[key])
      throw new EvidenceError("Submission canonical identity mismatch");
  return manifest.terms;
}

export function submissionPayment(
  manifest: CampaignManifest,
  verified: SubmissionVerification,
  rows: readonly Record<string, unknown>[],
  action: "a-create" | "a-fund" | "a-withdraw" | "withdraw-fee",
) {
  const terms = submissionClaimTerms(manifest);
  if (verified.campaignId !== "a" || verified.saleId !== manifest.identity.saleId)
    throw new EvidenceError("Submission verification belongs to another claim");
  const items = manifest.transactions.filter(
    (entry) => entry.action === action && entry.receiptStatus === 1,
  );
  const item = items[0];
  if (!item) throw new SubmissionUnverified("Submission payment transaction unavailable");
  if (items.length !== 1)
    throw new EvidenceError("Submission payment transaction unavailable or ambiguous");
  const payments = verified.paymentChecks.filter(
    (entry) => entry.transactionHash === item.transactionHash,
  );
  const payment = payments[0];
  if (!payment) throw new SubmissionUnverified("Submission freshly verified payment unavailable");
  if (payments.length !== 1)
    throw new EvidenceError("Submission freshly verified payment unavailable or ambiguous");
  const source = action === "a-create",
    funding = action === "a-fund",
    fee = action === "withdraw-fee";
  const economics = referenceEconomics(string(terms.grossPurchasePriceRaw), string(terms.feeBps));
  const amount = BigInt(
    source
      ? string(terms.sourceFaceValueRaw)
      : funding
        ? economics.grossPurchasePriceRaw
        : fee
          ? economics.feeRaw
          : economics.sellerNetRaw,
  );
  const from = string(
    source ? terms.feeRecipient : funding ? terms.buyer : terms.destinationMarket,
  );
  const to = string(
    source
      ? terms.sourceVault
      : funding
        ? terms.destinationMarket
        : fee
          ? terms.feeRecipient
          : terms.seller,
  );
  if (
    payment.token !== (source ? terms.sourceToken : terms.settlementToken) ||
    payment.blockHash !== item.blockHash ||
    payment.blockNumber !== item.blockNumber ||
    item.chainId !== (source ? "11155111" : "102031")
  )
    throw new EvidenceError("Submission payment token or canonical receipt mismatch");
  requireMovement(payment.actual, { from, to, amount });
  for (const [address, delta] of [
    [from, -amount],
    [to, amount],
  ] as const) {
    const balances = payment.balances.filter((entry) => entry.address === address),
      balance = balances[0];
    if (
      balances.length !== 1 ||
      !balance ||
      balance.afterTransaction - balance.beforeTransaction !== delta
    )
      throw new EvidenceError("Submission actual payment balance delta mismatch");
  }
  if (!source && !funding) {
    for (const state of ["mined", "withdrawal-verified"]) {
      const matches = rows.filter((row) => row.action === action && row.state === state),
        row = matches[0];
      if (!row) throw new SubmissionUnverified("Submission recorded withdrawal unavailable");
      if (
        matches.length !== 1 ||
        row.transactionHash !== item.transactionHash ||
        row.amount !== amount.toString()
      )
        throw new EvidenceError("Submission recorded withdrawal amount or transaction mismatch");
      if (
        state === "mined" &&
        (row.sender !== to ||
          row.contract !== from ||
          row.chainId !== item.chainId ||
          record(row.receipt).status !== 1)
      )
        throw new EvidenceError("Submission recorded withdrawal actor or receipt mismatch");
    }
  }
  return {
    action,
    amountRaw: amount,
    from,
    to,
    ...payment,
    receipt: item.receipt,
    timeline: manifest.timeline,
  };
}

export async function checkSubmissionClaimPayments(
  manifest: CampaignManifest,
  verified: SubmissionVerification,
) {
  const timeline: unknown = JSON.parse((await checkedArtifact(manifest.timeline)).toString("utf8"));
  if (!Array.isArray(timeline))
    throw new EvidenceError("Submission pinned timeline is not an array");
  const rows = timeline.map(record);
  return {
    creation: submissionPayment(manifest, verified, rows, "a-create"),
    funding: submissionPayment(manifest, verified, rows, "a-fund"),
    sellerWithdrawal: submissionPayment(manifest, verified, rows, "a-withdraw"),
    feeWithdrawal: submissionPayment(manifest, verified, rows, "withdraw-fee"),
  };
}
