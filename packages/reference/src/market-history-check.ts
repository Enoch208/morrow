import type { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "ethers";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { checkedArtifact, record, string } from "./evidence-files.ts";
import { proofCallMatches } from "./proof-history.ts";
import { referenceEconomics } from "./index.ts";
import { readMarketHistory } from "./market-history-read.ts";
import { assertMarketTransition } from "./market-transition.ts";
import { canonicalJson } from "./canonical-json.ts";
import { normalizedReceiptLog } from "./market-log-check.ts";
import type { CampaignManifest, TransactionEvidence } from "./manifest-types.ts";

export async function checkMarketHistory(
  rpc: JsonRpcProvider,
  item: TransactionEvidence,
  transaction: TransactionResponse,
  receipt: TransactionReceipt,
  manifest: CampaignManifest,
) {
  if (receipt.status !== 1)
    throw new EvidenceError(
      "Reverted market transitions need separate unchanged-state verification",
    );
  const operation = item.action.startsWith(`${manifest.campaignId}-`)
    ? item.action.slice(manifest.campaignId.length + 1)
    : item.action;
  const call = applicationInterfaces.market.parseTransaction({ data: transaction.data });
  if (!call) throw new EvidenceError("Market transaction has no decoded call");
  let eventKey: string | null = null;
  if (["fund", "settle", "refund"].includes(operation)) {
    const expectedSource =
      operation === "fund"
        ? "SaleReserved"
        : operation === "settle"
          ? "SaleAssigned"
          : "SaleCancelled";
    for (const proof of manifest.proofs.filter(
      (proof) => proof.decodedEvent.name === expectedSource,
    )) {
      const raw = record(
        JSON.parse((await checkedArtifact(proof.artifact)).toString("utf8")) as unknown,
      );
      if (proofCallMatches(raw, call, proof.receiptLocalLogIndex)) {
        if (eventKey !== null && eventKey !== proof.eventKey)
          throw new EvidenceError("Matching proof has conflicting event identities");
        eventKey = proof.eventKey;
      }
    }
    if (eventKey === null)
      throw new EvidenceError("Market transition lacks exact archived source proof");
  }
  const logs = await rpc.getLogs({
    address: applicationPins.market.address,
    blockHash: receipt.blockHash,
  });
  if (
    logs.some(
      (log) =>
        log.removed ||
        log.blockHash !== receipt.blockHash ||
        log.blockNumber !== receipt.blockNumber ||
        log.transactionHash !== receipt.hash ||
        log.transactionIndex !== receipt.index,
    )
  )
    throw new EvidenceError(
      "Cannot isolate market transition from another transaction in this block",
    );
  const receiptLogs = receipt.logs.filter((log) => log.address === applicationPins.market.address);
  if (
    canonicalJson(logs.map((log) => normalizedReceiptLog(log.toJSON() as unknown))) !==
    canonicalJson(receiptLogs.map((log) => normalizedReceiptLog(log.toJSON() as unknown)))
  )
    throw new EvidenceError("Market block logs differ from canonical receipt");
  const terms = manifest.terms;
  const economics = referenceEconomics(string(terms.grossPurchasePriceRaw), string(terms.feeBps));
  const price = BigInt(economics.grossPurchasePriceRaw),
    fee = BigInt(economics.feeRaw),
    net = BigInt(economics.sellerNetRaw);
  const expected =
    operation === "fund"
      ? {
          name: "ReservationFunded",
          args: [manifest.identity.saleId, eventKey, terms.buyer, price],
        }
      : operation === "settle"
        ? { name: "AssignmentRecognized", args: [manifest.identity.saleId, eventKey, net, fee] }
        : operation === "refund"
          ? { name: "CancellationRecognized", args: [manifest.identity.saleId, eventKey, price] }
          : {
              name: "CreditWithdrawn",
              args: [
                transaction.from,
                terms.settlementToken,
                operation === "withdraw-fee" ? fee : manifest.campaignId === "a" ? net : price,
              ],
            };
  const expectedLog = applicationInterfaces.market.encodeEventLog(expected.name, expected.args);
  if (
    logs.length !== 1 ||
    logs[0]?.data !== expectedLog.data ||
    canonicalJson(logs[0].topics) !== canonicalJson(expectedLog.topics)
  )
    throw new EvidenceError(
      "Market event differs from canonical recipients, amounts or proof identity",
    );
  const [previousBlock, block, before, after] = await Promise.all([
    rpc.getBlock(receipt.blockNumber - 1),
    rpc.getBlock(receipt.blockNumber),
    readMarketHistory(rpc, manifest, receipt.blockNumber - 1),
    readMarketHistory(rpc, manifest, receipt.blockNumber),
  ]);
  if (
    !previousBlock?.hash ||
    block?.hash !== receipt.blockHash ||
    block.parentHash !== previousBlock.hash
  )
    throw new EvidenceError("Market state boundaries are not canonical consecutive blocks");
  if (operation === "fund" && BigInt(block.timestamp) >= BigInt(string(terms.fundBefore)))
    throw new EvidenceError("Historical funding violated its deadline");
  const result = assertMarketTransition(
    operation,
    transaction.from,
    manifest,
    before.state,
    after.state,
    eventKey,
  );
  const rechecked = await rpc.getBlock(receipt.blockNumber);
  if (rechecked?.hash !== receipt.blockHash)
    throw new EvidenceError("Market state boundary reorganized");
  return {
    transactionHash: receipt.hash,
    evidenceKind: "historical-replay",
    before: { blockHash: previousBlock.hash, ...before },
    after: { blockHash: receipt.blockHash, ...after },
    ...result,
    limitation:
      "Block-boundary state attribution requires this to be the only market event-producing transaction in the block; arbitrary storage-slot and reverted-transaction coverage remain separate.",
  };
}
