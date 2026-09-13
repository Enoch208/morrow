import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { proofProvider } from "@gluwa/usc-sdk";
import type { JsonRpcProvider } from "ethers";
import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Directory, c5Record, recordC5 } from "./c5-log.ts";
import { ConfigurationError, proverEndpoints } from "./environment.ts";
import { parseProof } from "./proof.ts";
import { assertContinuityOnly, resolveHeldProof } from "./proof-refresh.ts";
import { canonicalC5Receipt, verifyC5Envelope } from "./c5-proof-validation.ts";
import type { C5ProofEvent } from "./c5-proof-validation.ts";

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function sourceContext(source: JsonRpcProvider, round: 1n | 2n, event: C5ProofEvent) {
  const terms = c5Terms(await c5ClaimId(), round);
  if (!["reserve", "assign", "cancel"].includes(event))
    throw new ConfigurationError("Unsupported C5 proof event");
  const entry = await c5Record(`c5-r${round.toString()}-${event}`, "mined");
  if (typeof entry.transactionHash !== "string")
    throw new ConfigurationError("Missing mined C5 source transaction");
  const receipt = await canonicalC5Receipt(source, entry.transactionHash);
  return { terms, receipt };
}

async function acquireArchive(
  hash: string,
  round: 1n | 2n,
  event: C5ProofEvent,
  kind: "original" | "refresh",
) {
  const started = Date.now();
  const response = await new proofProvider.service.ProofBuilder(
    1,
    proverEndpoints[0],
    12_000,
  ).getProof(hash);
  if (!response.data) throw new ConfigurationError(response.error ?? "C5 prover returned no proof");
  const text = JSON.stringify(response.data);
  const proofHash = digest(text);
  const filename = `c5-r${round.toString()}-${event}-${kind}-${Date.now().toString()}-${proofHash}.json`;
  const proofPath = `evidence/c5/${filename}`;
  await mkdir(c5Directory, { recursive: true });
  await writeFile(`${c5Directory}/${filename}`, text, { flag: "wx", flush: true });
  await recordC5({
    action: `c5-r${round.toString()}-${event}-proof`,
    state: "archived",
    evidenceKind: "proposed",
    sourceTransactionHash: hash,
    proofPath,
    proofHash,
    proofKind: kind,
    proofConstructionMs: Date.now() - started,
    proofReadyAt: new Date().toISOString(),
  });
  if (!response.success)
    throw new ConfigurationError(response.error ?? "C5 proof service rejected request");
  return { proof: parseProof(response.data, hash), raw: response.data, proofPath, proofHash };
}

type Archive = Pick<Awaited<ReturnType<typeof acquireArchive>>, "proofPath" | "proofHash">;
type Verified = Awaited<ReturnType<typeof verifyC5Envelope>>;

async function recordVerified(
  round: 1n | 2n,
  event: C5ProofEvent,
  archive: Archive,
  checked: Verified,
  history: Record<string, unknown>,
) {
  await recordC5({
    action: `c5-r${round.toString()}-${event}-proof`,
    state: "native-verified",
    evidenceKind: "live-read-verified",
    sourceTransactionHash: checked.sourceReceipt.hash,
    sourceBlock: checked.sourceReceipt.blockNumber,
    sourceBlockHash: checked.sourceReceipt.blockHash,
    proofPath: archive.proofPath,
    proofHash: archive.proofHash,
    ...checked.identity,
    receiptLocalLogIndex: checked.logIndex,
    eventKey: checked.eventKey,
    native: checked.native,
    ...history,
  });
}

export async function buildC5Proof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  round: 1n | 2n,
  event: C5ProofEvent,
) {
  const { terms, receipt } = await sourceContext(source, round, event);
  const archived = await acquireArchive(receipt.hash, round, event, "original");
  const checked = await verifyC5Envelope(
    source,
    destination,
    archived.proof,
    receipt,
    terms,
    event,
  );
  await recordVerified(round, event, archived, checked, {
    originalProofPath: archived.proofPath,
    originalProofHash: archived.proofHash,
    continuityRefreshed: false,
  });
  return {
    proof: archived.proof,
    proofPath: archived.proofPath,
    proofHash: archived.proofHash,
    terms,
    ...checked,
  };
}

export async function loadC5Proof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  round: 1n | 2n,
  event: C5ProofEvent,
) {
  const { terms, receipt } = await sourceContext(source, round, event);
  const record = await c5Record(`c5-r${round.toString()}-${event}-proof`, "native-verified");
  if (
    typeof record.proofPath !== "string" ||
    !new RegExp(
      `^evidence/c5/c5-r${round.toString()}-${event}-(original|refresh)-[0-9]+-[0-9a-f]{64}\\.json$`,
    ).test(record.proofPath) ||
    typeof record.proofHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.proofHash) ||
    record.sourceTransactionHash !== receipt.hash
  )
    throw new ConfigurationError("Invalid C5 archived proof record");
  const text = await readFile(`${c5Directory}/${basename(record.proofPath)}`, "utf8");
  if (digest(text) !== record.proofHash)
    throw new ConfigurationError("C5 archived proof bytes changed");
  const value: unknown = JSON.parse(text);
  const original = parseProof(value, receipt.hash);
  if (
    typeof record.originalProofPath !== "string" ||
    !new RegExp(
      `^evidence/c5/c5-r${round.toString()}-${event}-original-[0-9]+-[0-9a-f]{64}\\.json$`,
    ).test(record.originalProofPath) ||
    typeof record.originalProofHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.originalProofHash)
  )
    throw new ConfigurationError("C5 original proof archive reference missing or invalid");
  const originalText = await readFile(
    `${c5Directory}/${basename(record.originalProofPath)}`,
    "utf8",
  );
  if (digest(originalText) !== record.originalProofHash)
    throw new ConfigurationError("C5 original proof archive bytes changed");
  const originalValue: unknown = JSON.parse(originalText);
  assertContinuityOnly(parseProof(originalValue, receipt.hash), original);
  const archives: Archive[] = [];
  const selected = await resolveHeldProof(
    original,
    async () => {
      const refreshed = await acquireArchive(receipt.hash, round, event, "refresh");
      archives.push({ proofPath: refreshed.proofPath, proofHash: refreshed.proofHash });
      return refreshed;
    },
    (proof) => verifyC5Envelope(source, destination, proof, receipt, terms, event),
  );
  const checked = selected.native;
  if (
    record.eventKey !== checked.eventKey ||
    record.receiptLocalLogIndex !== checked.logIndex ||
    record.saleId !== checked.identity.saleId ||
    record.termsHash !== checked.identity.termsHash
  )
    throw new ConfigurationError("C5 archive identity differs from authenticated proof");
  const archive = archives[0] ?? { proofPath: record.proofPath, proofHash: record.proofHash };
  await recordVerified(round, event, archive, checked, {
    originalProofPath: record.originalProofPath,
    originalProofHash: record.originalProofHash,
    previousProofPath: record.proofPath,
    previousProofHash: record.proofHash,
    originalRejection: selected.originalRejection,
    continuityRefreshed: selected.refreshed !== null,
  });
  return { proof: selected.proof, ...archive, terms, ...checked };
}
