import type { SaleTerms } from "@morrow/protocol";
import {
  actionBlock,
  checkMarketConfiguration,
  finishPreparation,
  withBrowserAction,
} from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor, assertBrowserTerms } from "./browser-action-policy.ts";
import { assertSettlementSnapshot, browserMarketSnapshot } from "./browser-market.ts";
import { verifyBrowserProof } from "./browser-proof.ts";
import type { BrowserProofInput } from "./browser-proof.ts";
import { contractInterfaces } from "./contract-reads.ts";

export async function prepareBrowserSettlement(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  input: BrowserProofInput,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, actor, connectedChainId, terms.destinationEvmChainId);
  return withBrowserAction(options, async (context) => {
    const verified = await verifyBrowserProof(context, input, terms, "assign");
    const block = await actionBlock(context.destination, "destination");
    await checkMarketConfiguration(context.destination, terms, block.number);
    assertSettlementSnapshot(
      await browserMarketSnapshot(context.destination, terms, block.number),
      terms,
    );
    const data = contractInterfaces.market.encodeFunctionData("settleAssignment", [
      input.proof,
      verified.logIndex,
      verified.identity.saleId,
    ]);
    const prepared = await finishPreparation(
      context.destination,
      block,
      "settle",
      actor,
      "market",
      data,
    );
    return { ...prepared, terms, ...verified.identity, eventKey: verified.eventKey };
  });
}
