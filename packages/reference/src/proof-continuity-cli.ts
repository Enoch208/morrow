import { checkedArtifact, storeEvidence, record, string } from "./evidence-files.ts";
import { rpcPair, EvidenceError } from "./checker-rpc.ts";
import { compareProofContinuity, observeNativeProof } from "./proof-continuity.ts";

const assignment = {
  path: "evidence/campaign/a-assign-1789254577056-152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0.json",
  sha256: "152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0",
};
const reservation = {
  path: "evidence/campaign/a-reserve-1789253834769-719d6a4799d9d4effedb60239ecc69c8c8aa45ef284e6bd69b6011d90662ce48.json",
  sha256: "719d6a4799d9d4effedb60239ecc69c8c8aa45ef284e6bd69b6011d90662ce48",
};
const endpoint = "https://prover.cc3-testnet.creditcoin.network/api/v1/proof-by-tx/1/";
const { source, destination } = rpcPair();
try {
  if ((await destination.getNetwork()).chainId !== 102031n)
    throw new EvidenceError("Wrong destination testnet");
  const archived: unknown = JSON.parse((await checkedArtifact(assignment)).toString("utf8"));
  const reserved: unknown = JSON.parse((await checkedArtifact(reservation)).toString("utf8"));
  const transactionHash = string(record(archived).txHash);
  const response = await fetch(endpoint + transactionHash, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new EvidenceError(`Official proof service returned ${response.status.toString()}`);
  const refreshed: unknown = await response.json();
  const comparison = compareProofContinuity(archived, refreshed);
  const refreshedArtifact = await storeEvidence(refreshed);
  const current = await destination.getBlock("finalized");
  const historical = await destination.getBlock(5477514);
  if (!current?.hash || !historical?.hash) throw new EvidenceError("Missing verification blocks");
  const observations = {
    archivedAssignmentCurrent: await observeNativeProof(destination, archived, current.number),
    refreshedAssignmentCurrent: await observeNativeProof(destination, refreshed, current.number),
    archivedReservationCurrent: await observeNativeProof(destination, reserved, current.number),
    archivedReservationAtFunding: await observeNativeProof(
      destination,
      reserved,
      historical.number,
    ),
  };
  const report = await storeEvidence({
    evidenceKind: "live-read-verified",
    generatedAt: new Date().toISOString(),
    signingEnabled: false,
    sourceTransactionHash: transactionHash,
    assignment,
    reservation,
    refreshedArtifact,
    proofEndpoint: endpoint + transactionHash,
    currentBlock: { number: current.number, hash: current.hash, timestamp: current.timestamp },
    historicalBlock: {
      number: historical.number,
      hash: historical.hash,
      timestamp: historical.timestamp,
      evidenceKind: "historical-replay",
    },
    comparison,
    observations,
    limitations: [
      "Read-only diagnostic; no proof archive or worker delivery policy was changed",
      "Current acceptance is block-specific, not a future availability guarantee",
      "Cause of continuity witness changes has not been established from node implementation",
    ],
  });
  process.stdout.write(
    JSON.stringify({
      report,
      currentBlock: current.number,
      comparison,
      observations: Object.fromEntries(
        Object.entries(observations).map(([key, item]) => [
          key,
          { accepted: item.accepted, reason: item.reason, blockNumber: item.blockNumber },
        ]),
      ),
    }) + "\n",
  );
} finally {
  source.destroy();
  destination.destroy();
}
