import type { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "ethers";
import { applicationInterfaces } from "./manifest-chain.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import { canonicalJson } from "./canonical-json.ts";
import { sourceHistoryEvents } from "./source-history-events.ts";
import { readSourceHistory } from "./source-history-read.ts";
import { assertSourceTransition } from "./source-transition.ts";
import { assertSourceBlock } from "./source-block.ts";
import type { CampaignManifest, TransactionEvidence } from "./manifest-types.ts";

export async function checkSourceHistory(
  rpc: JsonRpcProvider,
  item: TransactionEvidence,
  transaction: TransactionResponse,
  receipt: TransactionReceipt,
  manifest: CampaignManifest,
) {
  if (receipt.status !== 1)
    throw new EvidenceError(
      "Reverted source transitions require separate unchanged-state verification",
    );
  const operation = item.action.slice(manifest.campaignId.length + 1);
  const terms = manifest.terms,
    claimId = BigInt(string(terms.claimId));
  const call = applicationInterfaces.vault.parseTransaction({ data: transaction.data });
  if (!call) throw new EvidenceError("Source transaction has no decoded call");
  const creationReference = operation === "create" ? string(call.args[4]) : undefined;
  const events = await sourceHistoryEvents(rpc, receipt, claimId);
  const expected =
    operation === "create"
      ? {
          name: "ClaimFunded",
          args: [
            claimId,
            transaction.from,
            terms.seller,
            terms.sourceToken,
            terms.sourceFaceValueRaw,
            terms.maturity,
            creationReference,
          ],
        }
      : operation === "redeem"
        ? {
            name: "ClaimRedeemed",
            args: [
              claimId,
              manifest.campaignId === "a" ? terms.buyer : terms.seller,
              terms.sourceToken,
              terms.sourceFaceValueRaw,
            ],
          }
        : {
            name:
              operation === "reserve"
                ? "SaleReserved"
                : operation === "assign"
                  ? "SaleAssigned"
                  : "SaleCancelled",
            args: [
              manifest.identity.saleId,
              claimId,
              terms.round,
              manifest.identity.termsHash,
              ...(operation === "reserve" ? [manifest.identity.encodedTerms] : []),
            ],
          };
  const encoded = applicationInterfaces.vault.encodeEventLog(expected.name, expected.args);
  if (
    events.log.data !== encoded.data ||
    canonicalJson(events.log.topics) !== canonicalJson(encoded.topics)
  )
    throw new EvidenceError("Source event differs from canonical claim/round/amount/recipient");
  const [previousBlock, block, before, after] = await Promise.all([
    rpc.getBlock(receipt.blockNumber - 1),
    rpc.getBlock(receipt.blockNumber),
    readSourceHistory(rpc, manifest, receipt.blockNumber - 1, operation === "create"),
    readSourceHistory(rpc, manifest, receipt.blockNumber, false),
  ]);
  if (
    !previousBlock?.hash ||
    block?.hash !== receipt.blockHash ||
    block.parentHash !== previousBlock.hash
  )
    throw new EvidenceError("Source state boundaries are not canonical consecutive blocks");
  const transition = assertSourceTransition(
    operation,
    transaction.from,
    BigInt(block.timestamp),
    manifest,
    before.state,
    after.state,
    creationReference,
  );
  const accounting = assertSourceBlock(events.changes, before.accounting, after.accounting);
  for (const snapshot of [before, after]) {
    if (
      snapshot.state.claim &&
      !snapshot.state.claim.redeemed &&
      snapshot.accounting.backing < snapshot.state.claim.face
    )
      throw new EvidenceError("Source backing does not cover selected unredeemed claim");
  }
  if ((await rpc.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash)
    throw new EvidenceError("Source state boundary reorganized");
  return {
    transactionHash: receipt.hash,
    evidenceKind: "historical-replay",
    before: { blockHash: previousBlock.hash, ...before },
    after: { blockHash: receipt.blockHash, ...after },
    transition,
    accounting,
    sourceBlockEvents: events.rawLogs,
    limitation:
      "Claim attribution requires one event for this claim in the block; global backing/counter account for all vault events. Other rounds, reverted transactions and arbitrary storage slots remain separate.",
  };
}
