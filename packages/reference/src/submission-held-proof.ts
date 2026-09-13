import type { JsonRpcProvider } from "ethers";
import { EvidenceError } from "./checker-rpc.ts";
import { checkedArtifact, record, number, string } from "./evidence-files.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import { observeNativeProof } from "./proof-continuity.ts";
import { canonicalPoint } from "./submission-history.ts";
import { SubmissionUnverified } from "./submission-report.ts";

export function recordedAssignmentAnchor(
  manifest: CampaignManifest,
  rows: readonly Record<string, unknown>[],
  beforeHeight: number,
) {
  for (const row of rows) {
    if (row.action !== "a-assign-proof" || row.state !== "native-verified" || !row.native) continue;
    const native = record(row.native);
    if (native.blockNumber === undefined) continue;
    const height = number(native.blockNumber);
    const proof = manifest.proofs.find(
      (proof) =>
        proof.decodedEvent.name === "SaleAssigned" &&
        proof.artifact.sha256 === row.proofHash &&
        proof.artifact.path === row.proofPath &&
        proof.sourceTransactionHash === row.sourceTransactionHash &&
        proof.sourceBlock === row.sourceBlock &&
        proof.eventKey === row.eventKey,
    );
    if (proof && height < beforeHeight) return { artifact: proof.artifact, height, native };
  }
  throw new SubmissionUnverified(
    "No recorded native assignment-proof anchor before the BOUND checkpoint",
  );
}

export async function replayHeldAssignment(
  manifest: CampaignManifest,
  rows: readonly Record<string, unknown>[],
  destination: JsonRpcProvider,
  beforeHeight: number,
) {
  const anchor = recordedAssignmentAnchor(manifest, rows, beforeHeight);
  const point = await canonicalPoint(destination, anchor.height, string(anchor.native.blockHash));
  if (point.timestamp !== number(anchor.native.blockTimestamp))
    throw new EvidenceError("Held-proof native checkpoint timestamp mismatch");
  const proof: unknown = JSON.parse((await checkedArtifact(anchor.artifact)).toString("utf8"));
  const replay = await observeNativeProof(destination, proof, anchor.height);
  const recorded = record(anchor.native.verification);
  if (!replay.accepted || replay.calldata !== recorded.calldata || replay.raw !== recorded.raw)
    throw new EvidenceError("Held assignment proof rejected or differs from recorded native call");
  await canonicalPoint(destination, point.number, point.hash);
  return { artifact: anchor.artifact, point, replay, evidenceKind: "historical-replay" };
}
