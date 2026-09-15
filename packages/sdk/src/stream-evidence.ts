import type { JsonRpcProvider, TransactionReceipt, TransactionRequest } from "ethers";
import { ConfigurationError, proverEndpoints } from "./environment.ts";
import { obtainProof, verifyNativeProof } from "./proof.ts";
import { sablierLockup } from "./stream-config.ts";
import type { StreamStep } from "./stream-config.ts";
import { settledStream, streamField } from "./stream-log.ts";
import { vaultInterface } from "./stream-setup.ts";

export interface StreamContext {
  readonly source: JsonRpcProvider;
  readonly destination: JsonRpcProvider;
  readonly records: readonly Record<string, unknown>[];
}

export interface StreamRequest {
  readonly request: TransactionRequest;
  readonly context?: Record<string, unknown>;
}

export function createdStreamId(receipt: TransactionReceipt): bigint {
  const transfer = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === sablierLockup.toLowerCase() &&
      log.topics.length === 4 &&
      log.topics[1] === `0x${"00".repeat(32)}`,
  );
  if (!transfer?.topics[3]) throw new ConfigurationError("Stream mint log not found");
  return BigInt(transfer.topics[3]);
}

export function localLogIndex(receipt: TransactionReceipt, emitter: string, topic: string): bigint {
  const index = receipt.logs.findIndex(
    (log) => log.address.toLowerCase() === emitter.toLowerCase() && log.topics[0] === topic,
  );
  if (index < 0) throw new ConfigurationError("Expected sale event absent from receipt");
  return BigInt(index);
}

export async function provenEvent(context: StreamContext, step: StreamStep, eventName: string) {
  const hash = settledStream(context.records, step).transactionHash;
  const receipt = await context.source.getTransactionReceipt(hash);
  if (receipt?.status !== 1) throw new ConfigurationError("Source transaction missing or failed");
  const { proof } = await obtainProof(hash, proverEndpoints[0]);
  const native = await verifyNativeProof(
    context.destination,
    proof,
    await context.destination.getBlockNumber(),
  );
  if (native.verification.decoded[0] !== true)
    throw new ConfigurationError("Native verifier refused proof");
  const event = vaultInterface.getEvent(eventName);
  if (!event) throw new ConfigurationError(`Unknown vault event ${eventName}`);
  return {
    proof,
    logIndex: localLogIndex(
      receipt,
      streamField(context.records, "deploy-stream-vault", "contractAddress"),
      event.topicHash,
    ),
  };
}
