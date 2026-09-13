import { isError } from "ethers";
import type { ProofEnvelope } from "@morrow/protocol";
import { ConfigurationError } from "./environment.ts";

export function assertContinuityOnly(original: ProofEnvelope, refreshed: ProofEnvelope): void {
  const before = original.merkleProof;
  const after = refreshed.merkleProof;
  if (
    original.chainKey !== refreshed.chainKey ||
    original.blockHeight !== refreshed.blockHeight ||
    original.encodedTransaction !== refreshed.encodedTransaction ||
    before.root !== after.root ||
    before.siblings.length !== after.siblings.length ||
    before.siblings.some((sibling, index) => {
      const candidate = after.siblings[index];
      return sibling.hash !== candidate?.hash || sibling.isLeft !== candidate.isLeft;
    })
  )
    throw new ConfigurationError(
      "Authenticated proof components changed during continuity refresh",
    );
}

export async function resolveHeldProof<T>(
  original: ProofEnvelope,
  refresh: () => Promise<{ proof: ProofEnvelope; raw: unknown }>,
  verify: (proof: ProofEnvelope) => Promise<T>,
) {
  let originalRejection;
  try {
    const native = await verify(original);
    return { proof: original, native, refreshed: null, originalRejection: null };
  } catch (error: unknown) {
    if (
      !isError(error, "CALL_EXCEPTION") ||
      error.reason !== "Continuity proof does not match attestation or checkpoint"
    )
      throw error;
    originalRejection = { code: error.code, reason: error.reason, data: error.data };
  }
  const refreshed = await refresh();
  assertContinuityOnly(original, refreshed.proof);
  const native = await verify(refreshed.proof);
  return { proof: refreshed.proof, native, refreshed, originalRejection };
}
