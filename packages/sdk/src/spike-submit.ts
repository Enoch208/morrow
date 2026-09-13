import type { TransactionRequest, Wallet } from "ethers";
import { checkSpikeSubmission } from "./spike-budget.ts";
import { recordSpike, spikeRecords } from "./spike-log.ts";

export async function submitSpike(
  wallet: Wallet,
  action: string,
  chainId: bigint,
  transaction: TransactionRequest,
  gasLimit: bigint,
  gasPrice: bigint,
  artifactHash: string,
): Promise<void> {
  const costCeiling = gasLimit * gasPrice;
  checkSpikeSubmission(await spikeRecords(), action, chainId, costCeiling);
  const nonce = await wallet.getNonce("pending");
  await recordSpike({
    action,
    state: "prepared",
    evidenceKind: "proposed",
    chainId,
    nonce,
    costCeiling,
    artifactHash,
  });
  const response = await wallet.sendTransaction({
    ...transaction,
    nonce,
    gasLimit,
    gasPrice,
    type: 0,
  });
  await recordSpike({
    action,
    state: "submitted",
    evidenceKind: "proposed",
    chainId,
    transactionHash: response.hash,
    costCeiling,
    artifactHash,
  });
  const receipt = await response.wait(1, 45_000);
  if (!receipt) throw new Error("Receipt unavailable; reconcile submitted hash before retry");
  await recordSpike({
    action,
    state: receipt.status === 1 ? "mined" : "reverted",
    evidenceKind: "live-testnet-mined",
    chainId,
    transactionHash: response.hash,
    contractAddress: receipt.contractAddress,
    receipt: receipt.toJSON(),
    artifactHash,
  });
  if (receipt.status !== 1) throw new Error("Testnet transaction reverted");
}
