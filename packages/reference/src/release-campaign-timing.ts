import type { JsonRpcProvider } from "ethers";
import type { CampaignManifest } from "./manifest-types.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { assertReleaseTiming, requireTerminalCampaign } from "./release-campaign-policy.ts";

export async function releaseCampaignTiming(
  manifest: CampaignManifest,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const actions = requireTerminalCampaign(manifest);
  const timestamps: Record<string, number> = {};
  const receipts = [];
  for (const action of actions) {
    const item = manifest.transactions.find(
      (transaction) => transaction.action === action && transaction.receiptStatus === 1,
    );
    if (!item) throw new EvidenceError("Required terminal campaign receipt unavailable");
    const rpc = item.chainId === "11155111" ? source : destination;
    const [receipt, block] = await Promise.all([
      rpc.getTransactionReceipt(item.transactionHash),
      rpc.getBlock(item.blockNumber),
    ]);
    if (
      receipt?.status !== 1 ||
      receipt.hash !== item.transactionHash ||
      receipt.blockNumber !== item.blockNumber ||
      receipt.blockHash !== item.blockHash ||
      block?.hash !== item.blockHash ||
      block.transactions[receipt.index] !== item.transactionHash
    )
      throw new EvidenceError(`Terminal ${action} receipt or timestamp block is not canonical`);
    const fresh: unknown = await rpc.send("eth_getBlockByNumber", [
      `0x${item.blockNumber.toString(16)}`,
      false,
    ]);
    if (!fresh || typeof fresh !== "object" || !("hash" in fresh) || fresh.hash !== item.blockHash)
      throw new EvidenceError(`Terminal ${action} block changed during verification`);
    timestamps[action] = block.timestamp;
    const rawReceipt: unknown = receipt.toJSON();
    receipts.push({
      action,
      chainId: item.chainId,
      transactionHash: item.transactionHash,
      blockNumber: item.blockNumber,
      blockHash: item.blockHash,
      timestamp: block.timestamp,
      receipt: rawReceipt,
      archivedReceipt: item.receipt,
    });
  }
  return { timings: assertReleaseTiming(manifest, timestamps), receipts };
}
