import { isError } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError, interfaces, pins } from "./checker-rpc.ts";
import { canonicalJson } from "./canonical-json.ts";
import { record, number, string } from "./evidence-files.ts";

export function compareProofContinuity(archived: unknown, refreshed: unknown) {
  const original = record(archived);
  const current = record(refreshed);
  const immutableFields = ["chainKey", "headerNumber", "txHash", "txBytes", "merkleProof"];
  for (const field of immutableFields) {
    if (original[field] === undefined || current[field] === undefined)
      throw new EvidenceError(`Missing authenticated proof component: ${field}`);
    if (canonicalJson(original[field]) !== canonicalJson(current[field]))
      throw new EvidenceError(`Authenticated proof component changed: ${field}`);
  }
  if (number(original.chainKey) !== 1) throw new EvidenceError("Unexpected source chain key");
  number(original.headerNumber);
  string(original.txHash);
  string(original.txBytes);
  const before = record(original.continuityProof);
  const after = record(current.continuityProof);
  if (!Array.isArray(before.roots) || !Array.isArray(after.roots))
    throw new EvidenceError("Missing continuity roots");
  return {
    authenticatedComponentsUnchanged: true,
    continuityChanged: canonicalJson(before) !== canonicalJson(after),
    originalRootCount: before.roots.length,
    refreshedRootCount: after.roots.length,
    lowerEndpointUnchanged: before.lowerEndpointDigest === after.lowerEndpointDigest,
  };
}

export async function observeNativeProof(
  rpc: JsonRpcProvider,
  value: unknown,
  blockNumber: number,
) {
  const proof = record(value);
  const method = "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))";
  const calldata = interfaces.native.encodeFunctionData(method, [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
  ]);
  try {
    const raw = await rpc.call({ to: pins.native, data: calldata, blockTag: blockNumber });
    return {
      blockNumber,
      calldata,
      raw,
      accepted: interfaces.native.decodeFunctionResult(method, raw)[0] === true,
      revertData: null,
      reason: null,
    };
  } catch (error: unknown) {
    if (!isError(error, "CALL_EXCEPTION")) throw error;
    return {
      blockNumber,
      calldata,
      raw: null,
      accepted: false,
      revertData: error.data,
      reason: error.reason,
    };
  }
}
