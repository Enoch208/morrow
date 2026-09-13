import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { EvidenceError, integer } from "./checker-rpc.ts";
import { normalizedReceiptLog } from "./market-log-check.ts";
import { canonicalJson } from "./canonical-json.ts";
import type { SourceBlockChange } from "./source-block.ts";

export async function sourceHistoryEvents(
  rpc: JsonRpcProvider,
  receipt: TransactionReceipt,
  claimId: bigint,
) {
  const logs = await rpc.getLogs({
    address: applicationPins.vault.address,
    blockHash: receipt.blockHash,
  });
  if (
    logs.some(
      (log) =>
        log.removed ||
        log.address !== applicationPins.vault.address ||
        log.blockHash !== receipt.blockHash ||
        log.blockNumber !== receipt.blockNumber ||
        (log.transactionHash === receipt.hash) !== (log.transactionIndex === receipt.index),
    )
  )
    throw new EvidenceError("Source event coordinates do not match canonical block");
  const own = logs.filter((log) => log.transactionHash === receipt.hash);
  const receiptLogs = receipt.logs.filter((log) => log.address === applicationPins.vault.address);
  const normalized = (items: typeof logs) =>
    canonicalJson(items.map((log) => normalizedReceiptLog(log.toJSON() as unknown)));
  if (normalized(own) !== normalized(receiptLogs))
    throw new EvidenceError("Source block logs differ from transaction receipt");
  const changes: SourceBlockChange[] = logs.map((log) => {
    const event = applicationInterfaces.vault.parseLog(log);
    if (
      !event ||
      !["ClaimFunded", "ClaimRedeemed", "SaleReserved", "SaleAssigned", "SaleCancelled"].includes(
        event.name,
      )
    )
      throw new EvidenceError("Unrecognized source event");
    const creation = event.name === "ClaimFunded",
      redemption = event.name === "ClaimRedeemed";
    if (
      (creation || redemption) &&
      event.args[creation ? 3 : 2] !== applicationPins.sourceToken.address
    )
      throw new EvidenceError("Source event has wrong backing token");
    return {
      name: event.name,
      claimId: integer(event.args[creation || redemption ? 0 : 1]),
      face: creation ? integer(event.args[4]) : redemption ? integer(event.args[3]) : 0n,
      transactionIndex: log.transactionIndex,
      logIndex: log.index,
    };
  });
  const selected = changes.filter((change) => change.claimId === claimId);
  if (own.length !== 1 || selected.length !== 1 || selected[0]?.transactionIndex !== receipt.index)
    throw new EvidenceError("Cannot isolate this claim transition within its block");
  const log = own[0];
  if (!log) throw new EvidenceError("Source transaction has no event");
  return { log, changes, rawLogs: logs.map((entry) => entry.toJSON() as unknown) };
}
