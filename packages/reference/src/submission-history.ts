import { keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { checkedArtifact, record, string } from "./evidence-files.ts";
import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { applicationPins, applicationRead, applicationInterfaces } from "./manifest-chain.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import type { SubmissionObservation } from "./submission-report.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";

export async function submissionTimeline(manifest: CampaignManifest) {
  const value: unknown = JSON.parse((await checkedArtifact(manifest.timeline)).toString("utf8"));
  if (!Array.isArray(value)) throw new EvidenceError("Invalid campaign timeline");
  return (value as unknown[]).map(record);
}

export function historyRow(
  rows: readonly Record<string, unknown>[],
  action: string,
  state: string,
) {
  const row = rows.filter((row) => row.action === action && row.state === state).at(-1);
  if (!row) throw new SubmissionUnverified(`Missing recorded ${action}/${state}`);
  return row;
}

export async function canonicalPoint(rpc: JsonRpcProvider, height: number, hash: string) {
  const block = await rpc.getBlock(height);
  if (!block) throw new SubmissionUnverified(`Block ${height.toString()} unavailable`);
  if (block.hash !== hash) throw new EvidenceError("Recorded block hash is not canonical");
  return { number: block.number, hash, timestamp: block.timestamp };
}

export async function pinnedRuntime(
  rpc: JsonRpcProvider,
  role: "vault" | "market",
  height: number,
) {
  const pin = applicationPins[role];
  if ((await rpc.getNetwork()).chainId.toString() !== pin.chainId)
    throw new EvidenceError("Wrong submission verification chain");
  if (keccak256(await rpc.getCode(pin.address, height)) !== pin.codeHash)
    throw new EvidenceError("Submission runtime differs from pinned deployment");
}

export async function assignedAt(manifest: CampaignManifest, rpc: JsonRpcProvider, height: number) {
  await pinnedRuntime(rpc, "vault", height);
  const claimId = string(manifest.terms.claimId),
    roundId = string(manifest.terms.round);
  const [claimRead, roundRead] = await Promise.all([
    applicationRead(rpc, "vault", "getClaim", [claimId], height),
    applicationRead(rpc, "vault", "getRound", [claimId, roundId], height),
  ]);
  const claim = tuple(
    applicationInterfaces.vault.decodeFunctionResult("getClaim", claimRead.raw)[0],
  );
  const round = tuple(
    applicationInterfaces.vault.decodeFunctionResult("getRound", roundRead.raw)[0],
  );
  const identity = referenceIdentity(referenceTerms(tuple(round[0])));
  if (
    integer(round[1]) !== 2n ||
    claim[4] !== manifest.terms.buyer ||
    claim[7] !== true ||
    identity.saleId !== manifest.identity.saleId ||
    round[2] !== identity.saleId ||
    round[3] !== identity.termsHash
  )
    throw new EvidenceError("Refusal checkpoint is not the exact assigned buyer-owned round");
  return { claimRead, roundRead, identity };
}

export function assertFinalityOrdering(fundingTimestamp: number, assignmentTimestamp: number) {
  if (fundingTimestamp >= assignmentTimestamp)
    throw new EvidenceError("Funding block timestamp does not precede assignment");
}

export function assertFundingFinalized(
  finalizedHeight: number | undefined,
  fundingHeight: number,
): number {
  if (finalizedHeight === undefined || finalizedHeight < fundingHeight)
    throw new SubmissionUnverified("Funding is not covered by the current finalized head");
  return finalizedHeight;
}

export async function checkSubmissionFinality(
  manifest: CampaignManifest,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
): Promise<SubmissionObservation> {
  const fund = manifest.transactions.find((row) => row.action === "a-fund");
  const assign = manifest.transactions.find((row) => row.action === "a-assign");
  if (!fund || !assign) throw new SubmissionUnverified("Missing funding or assignment receipt");
  const funding = await canonicalPoint(destination, fund.blockNumber, fund.blockHash);
  const assignment = await canonicalPoint(source, assign.blockNumber, assign.blockHash);
  assertFinalityOrdering(funding.timestamp, assignment.timestamp);
  const finalized = await destination.getBlock("finalized");
  const finalizedHeight = assertFundingFinalized(
    finalized?.hash ? finalized.number : undefined,
    funding.number,
  );
  return {
    detail: `CC3 funding block ${funding.number.toString()} precedes Sepolia assignment block ${assignment.number.toString()} and is under finalized head ${finalizedHeight.toString()}; finality at assignment time is not claimed`,
    evidence: {
      funding,
      assignment,
      currentFinalized: { number: finalizedHeight, hash: finalized?.hash },
      limitation:
        "No authenticated record proves when the funding block became final relative to the assignment",
    },
  };
}
