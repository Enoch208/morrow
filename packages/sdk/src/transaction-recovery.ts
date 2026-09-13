import { keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { ConfigurationError, requireTestnet } from "./environment.ts";
import { requireCampaignAction } from "./submission-intent.ts";

export function recoveryIntent(value: Record<string, unknown>) {
  const { action, chainId, sender, contract, nonce, transactionHash, calldataHash } = value;
  if (
    typeof action !== "string" ||
    (chainId !== "11155111" && chainId !== "102031") ||
    typeof sender !== "string" ||
    !Object.values(campaignActors).some((address) => address === sender) ||
    typeof contract !== "string" ||
    !Object.values(campaignContracts).some(
      (pin) => pin.address === contract && pin.chainId.toString() === chainId,
    ) ||
    typeof nonce !== "number" ||
    !Number.isSafeInteger(nonce) ||
    nonce < 0 ||
    typeof transactionHash !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(transactionHash) ||
    typeof calldataHash !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(calldataHash)
  )
    throw new ConfigurationError("Missing or invalid public recovery intent");
  requireCampaignAction(action);
  return { action, chainId, sender, contract, nonce, transactionHash, calldataHash };
}

export function recoveryState(facts: {
  receiptStatus: number | null;
  transactionKnown: boolean;
  nonce: number;
  latestNonce: number;
  pendingNonce: number;
}) {
  if (facts.receiptStatus === 1) return "mined-awaiting-poststate";
  if (facts.receiptStatus === 0) return "reverted";
  if (facts.receiptStatus !== null) throw new ConfigurationError("Unknown receipt status");
  if (facts.latestNonce > facts.nonce) return "nonce-consumed-by-unidentified-transaction";
  if (facts.transactionKnown) return "pending";
  if (facts.pendingNonce > facts.nonce) return "pending-nonce-conflict";
  return "not-observed";
}

export async function inspectRecovery(
  rpc: JsonRpcProvider,
  intent: ReturnType<typeof recoveryIntent>,
) {
  await requireTestnet(rpc, BigInt(intent.chainId));
  const observed = await rpc.getBlock("latest");
  if (!observed?.hash) throw new ConfigurationError("Recovery observation block unavailable");
  const [transaction, receipt, latestNonce, pendingNonce, finalized] = await Promise.all([
    rpc.getTransaction(intent.transactionHash),
    rpc.getTransactionReceipt(intent.transactionHash),
    rpc.getTransactionCount(intent.sender, observed.number),
    rpc.getTransactionCount(intent.sender, "pending"),
    rpc.getBlock("finalized"),
  ]);
  if (
    transaction &&
    (transaction.hash !== intent.transactionHash ||
      transaction.chainId.toString() !== intent.chainId ||
      transaction.from !== intent.sender ||
      transaction.to !== intent.contract ||
      transaction.nonce !== intent.nonce ||
      transaction.value !== 0n ||
      keccak256(transaction.data) !== intent.calldataHash)
  )
    throw new ConfigurationError("Recovered transaction differs from durable intent");
  if (receipt) {
    const block = await rpc.getBlock(receipt.blockNumber);
    if (
      !transaction ||
      receipt.hash !== intent.transactionHash ||
      receipt.from !== intent.sender ||
      receipt.to !== intent.contract ||
      block?.hash !== receipt.blockHash ||
      transaction.blockHash !== receipt.blockHash ||
      receipt.blockNumber > observed.number ||
      (receipt.status !== 0 && receipt.status !== 1)
    )
      throw new ConfigurationError("Recovered receipt is inconsistent or not canonical");
  } else if (transaction?.blockNumber !== null && transaction?.blockNumber !== undefined) {
    throw new ConfigurationError("Mined transaction has no available receipt");
  }
  const rechecked = await rpc.getBlock(observed.number);
  if (rechecked?.hash !== observed.hash)
    throw new ConfigurationError("Recovery observation reorganized");
  const state = recoveryState({
    receiptStatus: receipt?.status ?? null,
    transactionKnown: transaction !== null,
    nonce: intent.nonce,
    latestNonce,
    pendingNonce,
  });
  return {
    intent,
    state,
    observationBlock: observed.number,
    observationHash: observed.hash,
    latestNonce,
    pendingNonce,
    pendingNonceIsUnpinned: true,
    finalizedBlock: finalized?.number ?? null,
    receiptFinalized:
      receipt !== null && finalized !== null && receipt.blockNumber <= finalized.number,
    transaction: transaction?.toJSON() as unknown,
    receipt: receipt?.toJSON() as unknown,
    signingEnabled: false,
    resubmissionAllowed: false,
    jobCompletionRecorded: false,
    limitation:
      "Receipt discovery is not verified application post-state. Missing hashes and nonce conflicts do not establish safe resubmission or a proven dropped transaction.",
  };
}
