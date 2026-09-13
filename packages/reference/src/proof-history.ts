import type { JsonRpcProvider, TransactionDescription, TransactionResponse } from "ethers";
import type { CampaignManifest, ProofEvidence } from "./manifest-types.ts";
import { checkedArtifact, record, number, string } from "./evidence-files.ts";
import { EvidenceError, interfaces, integer, tuple } from "./checker-rpc.ts";

const nativeMethod = "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))";
const sourceEvents: Readonly<Record<string, string>> = {
  fundReservation: "SaleReserved",
  settleAssignment: "SaleAssigned",
  recognizeCancellation: "SaleCancelled",
};

export function proofCallMatches(
  proof: Record<string, unknown>,
  call: TransactionDescription,
  logIndex: number,
): boolean {
  if (!["fundReservation", "settleAssignment", "recognizeCancellation"].includes(call.name))
    return false;
  const expected = interfaces.native.encodeFunctionData(nativeMethod, [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
  ]);
  const actual = interfaces.native.encodeFunctionData(nativeMethod, tuple(call.args[0]).toArray());
  return actual === expected && integer(call.args[1]) === BigInt(logIndex);
}

export async function blockAtOrBefore(
  lower: number,
  upper: number,
  timestamp: number,
  readTimestamp: (height: number) => Promise<number>,
): Promise<number> {
  if (lower > upper || (await readTimestamp(lower)) > timestamp)
    throw new EvidenceError("No historical block before proof observation");
  let low = lower;
  let high = upper;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if ((await readTimestamp(midpoint)) <= timestamp) low = midpoint;
    else high = midpoint - 1;
  }
  return low;
}

export async function historicalProofAnchor(
  destination: JsonRpcProvider,
  manifest: CampaignManifest,
  item: ProofEvidence,
  proof: Record<string, unknown>,
  transactions: ReadonlyMap<string, TransactionResponse>,
) {
  const action = `${manifest.campaignId}-${item.decodedEvent.name === "SaleReserved" ? "fund" : item.decodedEvent.name === "SaleAssigned" ? "settle" : "refund"}`;
  for (const transaction of manifest.transactions.filter(
    (entry) => entry.action === action && entry.receiptStatus === 1,
  )) {
    const actual = transactions.get(transaction.transactionHash);
    const call = actual ? interfaces.market.parseTransaction({ data: actual.data }) : null;
    if (call && proofCallMatches(proof, call, item.receiptLocalLogIndex))
      return {
        blockNumber: transaction.blockNumber,
        blockHash: transaction.blockHash,
        basis: "exact-mined-calldata",
        transactionHash: transaction.transactionHash,
      };
  }
  const journal: unknown = JSON.parse((await checkedArtifact(manifest.timeline)).toString("utf8"));
  if (!Array.isArray(journal)) throw new EvidenceError("Timeline is not an array");
  const entry = (journal as unknown[])
    .map(record)
    .find(
      (row) =>
        row.state === "native-verified" &&
        row.proofHash === item.artifact.sha256 &&
        row.proofPath === item.artifact.path &&
        row.observedAt === item.observedAt,
    );
  if (!entry) throw new EvidenceError("Unsubmitted proof lacks its original observation record");
  const native = record(entry.native);
  if (typeof native.blockNumber === "number") {
    const block = await destination.getBlock(number(native.blockNumber));
    if (!block?.hash || block.hash !== native.blockHash)
      throw new EvidenceError("Recorded native verification block is not canonical");
    return {
      blockNumber: block.number,
      blockHash: block.hash,
      basis: "recorded-native-block",
      transactionHash: null,
    };
  }
  const observed = Math.floor(Date.parse(string(entry.observedAt)) / 1000);
  if (!Number.isSafeInteger(observed)) throw new EvidenceError("Invalid proof observation time");
  const current = await destination.getBlock("finalized");
  if (!current?.hash || current.timestamp < observed)
    throw new EvidenceError("Proof observation is beyond finalized destination history");
  const first = Math.min(
    ...manifest.transactions
      .filter((entry) => entry.chainId === "102031")
      .map((entry) => entry.blockNumber),
  );
  const height = await blockAtOrBefore(first, current.number, observed, async (height) => {
    const block = await destination.getBlock(height);
    if (!block) throw new EvidenceError("Historical destination block unavailable");
    return block.timestamp;
  });
  const block = await destination.getBlock(height);
  if (!block?.hash) throw new EvidenceError("Historical proof block unavailable");
  return {
    blockNumber: height,
    blockHash: block.hash,
    basis: "reconstructed-observation-time-not-original-call-block",
    transactionHash: null,
  };
}

export async function requireProofCoverage(
  manifest: CampaignManifest,
  transactions: ReadonlyMap<string, Pick<TransactionResponse, "data">>,
): Promise<void> {
  const artifacts = await Promise.all(
    manifest.proofs.map(async (item) => ({
      item,
      proof: record(JSON.parse((await checkedArtifact(item.artifact)).toString("utf8")) as unknown),
    })),
  );
  for (const transaction of manifest.transactions.filter(
    (entry) =>
      entry.receiptStatus === 1 &&
      ["fund", "settle", "refund"].some(
        (suffix) => entry.action === `${manifest.campaignId}-${suffix}`,
      ),
  )) {
    const actual = transactions.get(transaction.transactionHash);
    const call = actual ? interfaces.market.parseTransaction({ data: actual.data }) : null;
    if (
      !call ||
      !artifacts.some(
        ({ item, proof }) =>
          item.decodedEvent.name === sourceEvents[call.name] &&
          proofCallMatches(proof, call, item.receiptLocalLogIndex),
      )
    )
      throw new EvidenceError(
        "Mined funding/outcome proof is omitted or differs from archived bytes",
      );
  }
}
