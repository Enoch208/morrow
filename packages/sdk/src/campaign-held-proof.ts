import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { campaignRecord, campaignRecords, recordCampaign } from "./campaign-log.ts";
import { obtainProof, parseProof, verifyNativeProof } from "./proof.ts";
import { resolveHeldProof } from "./proof-refresh.ts";
import { ConfigurationError, proverEndpoints, repositoryRoot } from "./environment.ts";
import type { JsonRpcProvider } from "ethers";

export async function heldAssignmentProof(destination: JsonRpcProvider) {
  const archived = await campaignRecord("a-assign-archive", "archived");
  const record = (await campaignRecords()).find(
    (entry) =>
      entry.action === "a-assign-proof" &&
      entry.state === "native-verified" &&
      entry.proofHash === archived.proofHash &&
      entry.proofPath === archived.proofPath,
  );
  if (!record) throw new ConfigurationError("Archived proof lacks its native verification record");
  if (
    typeof record.proofPath !== "string" ||
    !/^evidence\/campaign\/a-assign-\d+-[0-9a-f]{64}\.json$/.test(record.proofPath) ||
    typeof record.sourceTransactionHash !== "string" ||
    typeof record.receiptLocalLogIndex !== "number" ||
    !Number.isSafeInteger(record.receiptLocalLogIndex) ||
    record.receiptLocalLogIndex < 0
  )
    throw new ConfigurationError("No valid archived assignment proof record");
  const raw = await readFile(`${repositoryRoot}${record.proofPath}`, "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== record.proofHash)
    throw new ConfigurationError("Held proof bytes changed");
  const value: unknown = JSON.parse(raw);
  const proof = parseProof(value, record.sourceTransactionHash);
  const sourceTransactionHash = record.sourceTransactionHash;
  const historicalNative = record.native;
  if (
    typeof historicalNative !== "object" ||
    historicalNative === null ||
    !("provenTxIndex" in historicalNative) ||
    typeof historicalNative.provenTxIndex !== "string" ||
    !/^\d+$/.test(historicalNative.provenTxIndex)
  )
    throw new ConfigurationError("Archived native transaction index missing");
  const expectedIndex = BigInt(historicalNative.provenTxIndex);
  let proofReadyAt: string | null = null;
  let proofConstructionMs: number | null = null;
  const verificationBlocks: { number: number; hash: string; timestamp: number }[] = [];
  const selected = await resolveHeldProof(
    proof,
    async () => {
      const started = Date.now();
      const refreshed = await obtainProof(sourceTransactionHash, proverEndpoints[0]);
      proofConstructionMs = Date.now() - started;
      proofReadyAt = new Date().toISOString();
      return refreshed;
    },
    async (candidate) => {
      const block = await destination.getBlock("finalized");
      if (!block?.hash) throw new ConfigurationError("Finalized verification block unavailable");
      verificationBlocks.push({
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
      });
      const native = await verifyNativeProof(destination, candidate, block.number);
      if (native.provenTxIndex !== expectedIndex)
        throw new ConfigurationError("Refreshed native transaction index changed");
      return {
        ...native,
        blockNumber: block.number,
        blockHash: block.hash,
        blockTimestamp: block.timestamp,
      };
    },
  );
  if (!selected.refreshed)
    return {
      proof: selected.proof,
      record,
      native: selected.native,
      logIndex: record.receiptLocalLogIndex,
    };
  const refreshedText = JSON.stringify(selected.refreshed.raw);
  const proofHash = createHash("sha256").update(refreshedText).digest("hex");
  const proofPath = `evidence/campaign/a-assign-refresh-${Date.now().toString()}-${proofHash}.json`;
  await writeFile(`${repositoryRoot}${proofPath}`, refreshedText, { flag: "wx" });
  const refreshedRecord = {
    ...record,
    observedAt: new Date().toISOString(),
    proofPath,
    proofHash,
    eventKey: record.eventKey,
    proofReadyAt,
    proofConstructionMs,
    native: selected.native,
    originalProofPath: record.proofPath,
    originalProofHash: record.proofHash,
    originalRejection: selected.originalRejection,
    verificationBlocks,
    continuityRefreshed: true,
  };
  await recordCampaign(refreshedRecord);
  return {
    proof: selected.proof,
    record: refreshedRecord,
    native: selected.native,
    logIndex: record.receiptLocalLogIndex,
  };
}
