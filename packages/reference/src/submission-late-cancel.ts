import type { JsonRpcProvider } from "ethers";
import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { string, number } from "./evidence-files.ts";
import { applicationInterfaces, applicationRead } from "./manifest-chain.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import type { verifyManifest } from "./manifest-verify.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";
import { historyRow, canonicalPoint, pinnedRuntime, assignedAt } from "./submission-history.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import { replayRefusal } from "./submission-refusal.ts";
import { replayHeldAssignment } from "./submission-held-proof.ts";

export function assertLateCheckpoint(
  terms: Record<string, unknown>,
  sourceTimestamp: number,
  destinationTimestamp: number,
  recordedSourceTimestamp: number,
  recordedDestinationTimestamp: number,
) {
  if (
    sourceTimestamp !== recordedSourceTimestamp ||
    destinationTimestamp !== recordedDestinationTimestamp
  )
    throw new EvidenceError("Recorded checkpoint timestamp differs from canonical block");
  for (const timestamp of [sourceTimestamp, destinationTimestamp])
    if (
      BigInt(timestamp) <= BigInt(string(terms.assignBefore)) ||
      BigInt(timestamp) <= BigInt(string(terms.maturity))
    )
      throw new EvidenceError(
        "Recorded cancellation checkpoint is not after deadline and maturity",
      );
}

export async function checkSubmissionLateCancellation(
  manifest: CampaignManifest,
  rows: readonly Record<string, unknown>[],
  verified: Awaited<ReturnType<typeof verifyManifest>>,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const row = historyRow(rows, "a-deadline-check", "delay-safety-verified");
  const sourcePoint = await canonicalPoint(
    source,
    number(row.sourceBlock),
    string(row.sourceBlockHash),
  );
  const destinationPoint = await canonicalPoint(
    destination,
    number(row.destinationBlock),
    string(row.destinationBlockHash),
  );
  assertLateCheckpoint(
    manifest.terms,
    sourcePoint.timestamp,
    destinationPoint.timestamp,
    number(row.sourceTimestamp),
    number(row.destinationTimestamp),
  );
  const state = await assignedAt(manifest, source, sourcePoint.number);
  await pinnedRuntime(destination, "market", destinationPoint.number);
  const saleRead = await applicationRead(
    destination,
    "market",
    "getSale",
    [manifest.identity.saleId],
    destinationPoint.number,
  );
  const sale = tuple(applicationInterfaces.market.decodeFunctionResult("getSale", saleRead.raw)[0]);
  if (
    integer(sale[1]) !== 1n ||
    saleRead.raw !== row.destinationSaleRaw ||
    referenceIdentity(referenceTerms(tuple(sale[0]))).saleId !== manifest.identity.saleId
  )
    throw new EvidenceError("Late checkpoint did not retain exact BOUND purchase");
  const held = await replayHeldAssignment(manifest, rows, destination, destinationPoint.number);
  if (!verified.proofChecks.some((check) => check.artifact.sha256 === held.artifact.sha256))
    throw new SubmissionUnverified("Held assignment archive lacks independent source verification");
  const settlement = manifest.transactions.find((item) => item.action === "a-settle");
  if (!settlement || settlement.blockNumber <= destinationPoint.number)
    throw new EvidenceError("Assignment recognition did not occur after held-proof checkpoint");
  const calldata = applicationInterfaces.vault.encodeFunctionData("cancelExpiredSale", [
    manifest.terms.claimId,
    manifest.terms.round,
  ]);
  if (row.sourceCalldata !== calldata || row.mined !== false)
    throw new EvidenceError("Late cancellation calldata/record mismatch");
  const replay = await replayRefusal(
    source,
    "vault",
    string(manifest.terms.buyer),
    calldata,
    sourcePoint.number,
    string(row.revertData),
    "RoundMismatch",
  );
  await Promise.all([
    canonicalPoint(source, sourcePoint.number, sourcePoint.hash),
    canonicalPoint(destination, destinationPoint.number, destinationPoint.hash),
  ]);
  return {
    detail:
      "Late cancellation refused while exact purchase stayed BOUND and a historically accepted assignment proof remained unsettled",
    evidence: {
      sourcePoint,
      destinationPoint,
      state,
      saleRead,
      held,
      replay,
      limitation:
        "Historical native compatibility and delayed settlement; private withholding intent is not independently proven",
    },
  };
}
