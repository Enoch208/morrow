import { isError, isHexString } from "ethers";
import type { ProofEnvelope } from "@morrow/protocol";
import { contractInterfaces } from "./contract-reads.ts";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { decodedTuple } from "./decoded-state.ts";
import { c5ClaimId, recordC5 } from "./c5-log.ts";
import { c5Terms } from "./c5-config.ts";
import { loadC5Proof } from "./c5-proof.ts";
import { canonicalC5Receipt, validateC5Proof } from "./c5-proof-validation.ts";
import { verifyNativeProof } from "./proof.ts";
import { nativeInterfaces } from "./native.ts";
import { ConfigurationError } from "./errors.ts";
import type { C5Context } from "./c5-submit.ts";
import {
  c5RefusalSnapshot,
  assertC5RefusalState,
  assertC5RefusalUnchanged,
} from "./c5-refusal-snapshot.ts";

export function c5RefusalCall(proof: ProofEnvelope, logIndex: number, saleId: string): string {
  return contractInterfaces.market.encodeFunctionData("recognizeCancellation", [
    proof,
    logIndex,
    saleId,
  ]);
}

export function assertC5RefusalFinality(finalizedHeight: number, assignmentHeight: number): void {
  if (
    [finalizedHeight, assignmentHeight].some(
      (height) => !Number.isSafeInteger(height) || height < 0,
    )
  )
    throw new ConfigurationError("Invalid C5 refusal block height");
  if (finalizedHeight < assignmentHeight)
    throw new ConfigurationError("C5 refusal source assignment is unfinalized");
}

export function assertC5SameProofBytes(nativeCalldata: string, applicationCalldata: string): void {
  const call = contractInterfaces.market.decodeFunctionData(
    "recognizeCancellation",
    applicationCalldata,
  );
  const proof = decodedTuple(call[0], 5);
  const expected = nativeInterfaces.blockProver.encodeFunctionData(
    "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
    proof.toArray(),
  );
  if (nativeCalldata !== expected)
    throw new ConfigurationError("C5 refusal did not use identical native proof bytes");
}

export function c5RefusalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!isError(error, "CALL_EXCEPTION"))
    return { reverted: false, revertData: null, firstError: null, message, decoderError: null };
  const data = error.data;
  if (typeof data !== "string" || !isHexString(data) || data.length < 10)
    return {
      reverted: true,
      revertData: data,
      firstError: null,
      message,
      decoderError: "Missing or malformed revert data",
    };
  try {
    return {
      reverted: true,
      revertData: data,
      firstError: contractInterfaces.market.parseError(data)?.name ?? null,
      message,
      decoderError: null,
    };
  } catch (decodeError: unknown) {
    return {
      reverted: true,
      revertData: data,
      firstError: null,
      message,
      decoderError: decodeError instanceof Error ? decodeError.message : String(decodeError),
    };
  }
}

export async function c5Refusal(context: C5Context): Promise<void> {
  const claimId = await c5ClaimId();
  const terms = [c5Terms(claimId, 1n), c5Terms(claimId, 2n)] as const;
  const cancel = await loadC5Proof(context.source, context.destination, 1n, "cancel");
  const reserve = await loadC5Proof(context.source, context.destination, 2n, "reserve");
  const assign = await loadC5Proof(context.source, context.destination, 2n, "assign");
  const [source, destination] = await Promise.all([
    context.source.getBlock("finalized"),
    context.destination.getBlock("finalized"),
  ]);
  if (!source?.hash || !destination?.hash)
    throw new ConfigurationError("C5 refusal finalized blocks unavailable");
  assertC5RefusalFinality(source.number, assign.sourceReceipt.blockNumber);
  const blocks = {
    source: { number: source.number, hash: source.hash },
    destination: { number: destination.number, hash: destination.hash },
  };
  const keys = [cancel.eventKey, reserve.eventKey, assign.eventKey] as const;
  const before = await c5RefusalSnapshot(context, blocks, terms, keys);
  assertC5RefusalState(before, terms);
  const native = await verifyNativeProof(context.destination, cancel.proof, destination.number);
  const sourceReceipt = await canonicalC5Receipt(context.source, cancel.sourceReceipt.hash);
  const binding = validateC5Proof(
    cancel.proof,
    sourceReceipt,
    terms[0],
    "cancel",
    native.provenTxIndex,
  );
  if (binding.eventKey !== cancel.eventKey || binding.logIndex !== cancel.logIndex)
    throw new ConfigurationError("C5 refusal cancellation identity changed");
  const calldata = c5RefusalCall(cancel.proof, cancel.logIndex, assign.identity.saleId);
  assertC5SameProofBytes(native.verification.calldata, calldata);
  const common = {
    action: "c5-refusal",
    evidenceKind: "live-read-verified",
    transactionHash: null,
    evidenceType: "eth_call",
    blocks,
    terms,
    sourceReceipt,
    before,
    calldata,
    caller: campaignActors.PAYER,
    destinationMarket: campaignContracts.market.address,
    native: { ...native, blockNumber: destination.number, blockHash: destination.hash },
    proofs: [cancel, reserve, assign].map((bundle) => ({
      proofPath: bundle.proofPath,
      proofHash: bundle.proofHash,
      eventKey: bundle.eventKey,
      receiptLocalLogIndex: bundle.logIndex,
      sourceTransactionHash: bundle.sourceReceipt.hash,
      ...bundle.identity,
    })),
  };
  let result;
  try {
    const raw = await context.destination.call({
      to: campaignContracts.market.address,
      from: campaignActors.PAYER,
      data: calldata,
      blockTag: destination.number,
    });
    result = {
      reverted: false,
      revertData: null,
      firstError: null,
      message: "Application call unexpectedly succeeded",
      decoderError: null,
      raw,
    };
  } catch (error: unknown) {
    result = { ...c5RefusalError(error), raw: null };
  }
  await recordC5({ ...common, state: "refusal-observed", result });
  const after = await c5RefusalSnapshot(context, blocks, terms, keys);
  await recordC5({ ...common, state: "refusal-snapshotted", result, after });
  assertC5RefusalState(after, terms);
  assertC5RefusalUnchanged(before, after);
  if (!result.reverted || result.firstError !== "SaleIdMismatch")
    throw new ConfigurationError(
      `C5 refusal unexpected outcome: ${result.firstError ?? result.message}`,
    );
  await recordC5({
    ...common,
    state: "refusal-verified",
    result,
    after,
    unchanged: true,
    sameNativeProofBytes: true,
  });
}
