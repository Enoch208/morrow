import type { JsonRpcProvider, Log, TransactionReceipt, TransactionResponse } from "ethers";
import type { CampaignManifest, TransactionEvidence } from "./manifest-types.ts";
import { EvidenceError, integer } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import { applicationInterfaces, applicationPins, applicationRead } from "./manifest-chain.ts";
import { referenceEconomics } from "./index.ts";
import { reconstructBalance, requireMovement } from "./balance-history.ts";
import type { TokenMovement } from "./balance-history.ts";

const zero = "0x0000000000000000000000000000000000000000";

function movements(logs: readonly Log[], token: string): TokenMovement[] {
  return logs
    .filter(
      (log) =>
        log.address === token &&
        log.topics[0] === applicationInterfaces.sourceToken.getEvent("Transfer")?.topicHash,
    )
    .map((log) => {
      const event = applicationInterfaces.sourceToken.parseLog(log);
      if (!event || log.removed) throw new EvidenceError("Invalid or removed transfer log");
      return {
        from: string(event.args[0]),
        to: string(event.args[1]),
        amount: integer(event.args[2]),
        transactionIndex: log.transactionIndex,
      };
    });
}

export function expectedPayment(
  item: TransactionEvidence,
  transaction: Pick<TransactionResponse, "from" | "data">,
  manifest: CampaignManifest,
) {
  if (item.receiptStatus === 0) return null;
  const terms = manifest.terms;
  const operation = item.action.startsWith(`${manifest.campaignId}-`)
    ? item.action.slice(manifest.campaignId.length + 1)
    : item.action;
  const economics = referenceEconomics(string(terms.grossPurchasePriceRaw), string(terms.feeBps));
  if (operation === "create")
    return {
      from: string(terms.feeRecipient),
      to: string(terms.sourceVault),
      amount: BigInt(string(terms.sourceFaceValueRaw)),
    };
  if (operation === "redeem")
    return {
      from: string(terms.sourceVault),
      to: string(manifest.campaignId === "a" ? terms.buyer : terms.seller),
      amount: BigInt(string(terms.sourceFaceValueRaw)),
    };
  if (operation === "fund")
    return {
      from: string(terms.buyer),
      to: string(terms.destinationMarket),
      amount: BigInt(economics.grossPurchasePriceRaw),
    };
  if (operation === "withdraw" || operation === "withdraw-fee")
    return {
      from: string(terms.destinationMarket),
      to: transaction.from,
      amount: BigInt(
        operation === "withdraw-fee"
          ? economics.feeRaw
          : manifest.campaignId === "a"
            ? economics.sellerNetRaw
            : economics.grossPurchasePriceRaw,
      ),
    };
  if (operation === "supply-buyer") {
    const call = applicationInterfaces.settlementToken.parseTransaction({ data: transaction.data });
    if (
      call?.name !== "transfer" ||
      call.args[0] !== terms.buyer ||
      transaction.from !== terms.feeRecipient
    )
      throw new EvidenceError("Shared buyer supply has wrong actor or recipient");
    return { from: transaction.from, to: string(call.args[0]), amount: integer(call.args[1]) };
  }
  return null;
}

export async function checkTransactionPayments(
  rpc: JsonRpcProvider,
  item: TransactionEvidence,
  transaction: TransactionResponse,
  receipt: TransactionReceipt,
  manifest: CampaignManifest,
) {
  const role = item.chainId === "11155111" ? "sourceToken" : "settlementToken";
  const token = applicationPins[role].address;
  const actual = movements(receipt.logs, token);
  const expected = expectedPayment(item, transaction, manifest);
  requireMovement(actual, expected);
  const logs = await rpc.getLogs({ address: token, blockHash: receipt.blockHash });
  if (
    logs.some(
      (log) => log.blockHash !== receipt.blockHash || log.blockNumber !== receipt.blockNumber,
    )
  )
    throw new EvidenceError("Token log query returned another block");
  const changes = movements(logs, token);
  const targetChanges = movements(
    logs.filter((log) => log.transactionHash === receipt.hash),
    token,
  );
  requireMovement(targetChanges, expected);
  if (
    logs.some(
      (log) => (log.transactionHash === receipt.hash) !== (log.transactionIndex === receipt.index),
    )
  )
    throw new EvidenceError("Token logs have inconsistent transaction coordinates");
  const custody =
    item.chainId === "11155111"
      ? string(manifest.terms.sourceVault)
      : string(manifest.terms.destinationMarket);
  const addresses = new Set([
    custody,
    ...(expected ? [expected.from, expected.to] : []),
    ...changes.flatMap((change) => [change.from, change.to]),
  ]);
  addresses.delete(zero);
  const balances = [];
  for (const address of addresses) {
    const [before, after] = await Promise.all([
      applicationRead(rpc, role, "balanceOf", [address], receipt.blockNumber - 1),
      applicationRead(rpc, role, "balanceOf", [address], receipt.blockNumber),
    ]);
    const beforeValue = integer(
      applicationInterfaces[role].decodeFunctionResult("balanceOf", before.raw)[0],
    );
    const afterValue = integer(
      applicationInterfaces[role].decodeFunctionResult("balanceOf", after.raw)[0],
    );
    balances.push({
      address,
      beforeBlockRaw: before.raw,
      afterBlockRaw: after.raw,
      ...reconstructBalance(address, beforeValue, afterValue, changes, receipt.index),
    });
  }
  return {
    transactionHash: receipt.hash,
    token,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    actual,
    balances,
    reconstruction:
      "Per-transaction balances reconstructed from ordered token logs and verified RPC block-boundary balances",
  };
}
