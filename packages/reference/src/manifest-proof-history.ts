import type { JsonRpcProvider, TransactionResponse } from "ethers";
import type { CampaignManifest, ProofEvidence } from "./manifest-types.ts";
import { checkedArtifact, record } from "./evidence-files.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { historicalProofAnchor } from "./proof-history.ts";
import { observeNativeProof } from "./proof-continuity.ts";
import { checkManifestProof } from "./manifest-proof-check.ts";

export async function checkHistoricalProof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  item: ProofEvidence,
  manifest: CampaignManifest,
  transactions: ReadonlyMap<string, TransactionResponse>,
) {
  const proof = record(
    JSON.parse((await checkedArtifact(item.artifact)).toString("utf8")) as unknown,
  );
  const anchor = await historicalProofAnchor(destination, manifest, item, proof, transactions);
  await checkManifestProof(source, destination, item, manifest, anchor.blockNumber);
  const historical = await observeNativeProof(destination, proof, anchor.blockNumber);
  if (!historical.accepted) throw new EvidenceError("Historical native proof rejected");
  const currentBlock = await destination.getBlock("finalized");
  if (!currentBlock?.hash) throw new EvidenceError("Current native verification block unavailable");
  const current = await observeNativeProof(destination, proof, currentBlock.number);
  return {
    artifact: item.artifact,
    sourceTransactionHash: item.sourceTransactionHash,
    eventKey: item.eventKey,
    historical: { evidenceKind: "historical-replay", ...anchor, ...historical },
    current: { evidenceKind: "live-read-verified", blockHash: currentBlock.hash, ...current },
    authenticatedSourceEventVerified: true,
    limitation:
      "Historical acceptance does not assert current proof validity or latest source ownership",
  };
}
