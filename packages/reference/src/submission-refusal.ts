import { isError } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError, tuple, interfaces } from "./checker-rpc.ts";
import { checkedArtifact, record, string, number } from "./evidence-files.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import { observeNativeProof } from "./proof-continuity.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";
import { historyRow, canonicalPoint, pinnedRuntime, assignedAt } from "./submission-history.ts";

export function assertRefusalBytes(actual: string | null, recorded: string, expected: string) {
  if (actual !== recorded || actual !== expected)
    throw new EvidenceError("Refusal succeeded or returned different revert bytes");
}

export async function replayRefusal(
  rpc: JsonRpcProvider,
  role: "vault" | "market",
  from: string,
  calldata: string,
  height: number,
  recorded: string,
  expectedError: string,
) {
  let rejection: string | null = null;
  try {
    await rpc.call({
      to: applicationPins[role].address,
      from,
      data: calldata,
      value: 0n,
      blockTag: height,
    });
  } catch (error: unknown) {
    if (!isError(error, "CALL_EXCEPTION") || !error.data) throw error;
    rejection = error.data;
  }
  assertRefusalBytes(
    rejection,
    recorded,
    applicationInterfaces[role].encodeErrorResult(expectedError),
  );
  return { calldata, rejection, expectedError, transactionHash: null, kind: "eth_call" };
}

export async function checkSubmissionWrongSale(
  manifest: CampaignManifest,
  rows: readonly Record<string, unknown>[],
  destination: JsonRpcProvider,
) {
  const row = historyRow(rows, "wrong-sale-proof", "rejection-verified");
  const height = number(row.blockNumber),
    hash = string(row.blockHash);
  await canonicalPoint(destination, height, hash);
  await pinnedRuntime(destination, "market", height);
  const proof = record(
    JSON.parse(
      (
        await checkedArtifact({ path: string(row.proofPath), sha256: string(row.proofHash) })
      ).toString("utf8"),
    ) as unknown,
  );
  const calldata = string(row.calldata),
    call = applicationInterfaces.market.parseTransaction({ data: calldata });
  if (
    row.kind !== "market" ||
    row.mined !== false ||
    call?.name !== "fundReservation" ||
    referenceIdentity(referenceTerms(tuple(call.args[2]))).saleId !== manifest.identity.saleId
  )
    throw new EvidenceError("Wrong-sale refusal does not target Claim A funding");
  const native = await observeNativeProof(destination, proof, height);
  const actualNative = interfaces.native.encodeFunctionData(
    "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
    tuple(call.args[0]).toArray(),
  );
  if (!native.accepted || native.calldata !== actualNative)
    throw new EvidenceError("Wrong-sale refusal lacks native acceptance of identical proof bytes");
  const replay = await replayRefusal(
    destination,
    "market",
    string(manifest.terms.buyer),
    calldata,
    height,
    string(row.revertData),
    "SaleIdMismatch",
  );
  await canonicalPoint(destination, height, hash);
  return {
    detail: `SaleIdMismatch at CC3 block ${height.toString()}; identical native proof accepted`,
    evidence: { native, replay, blockHash: hash },
  };
}

export async function checkSubmissionCancellation(
  manifest: CampaignManifest,
  rows: readonly Record<string, unknown>[],
  source: JsonRpcProvider,
) {
  const row = historyRow(rows, "assigned-cancel-refusal", "rejection-verified");
  const height = number(row.blockNumber),
    hash = string(row.blockHash);
  await canonicalPoint(source, height, hash);
  const state = await assignedAt(manifest, source, height);
  const calldata = applicationInterfaces.vault.encodeFunctionData("cancelExpiredSale", [
    manifest.terms.claimId,
    manifest.terms.round,
  ]);
  if (row.calldata !== calldata || row.mined !== false || row.kind !== "vault")
    throw new EvidenceError("Assigned cancellation calldata/record mismatch");
  const replay = await replayRefusal(
    source,
    "vault",
    string(manifest.terms.buyer),
    calldata,
    height,
    string(row.revertData),
    "RoundMismatch",
  );
  await canonicalPoint(source, height, hash);
  return {
    detail: `Assigned-round cancellation refused with RoundMismatch at Sepolia ${height.toString()}`,
    evidence: { state, replay, blockHash: hash },
  };
}
