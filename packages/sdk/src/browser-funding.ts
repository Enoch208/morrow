import type { SaleTerms } from "@morrow/protocol";
import {
  actionBlock,
  assertFreshTimestamp,
  checkMarketConfiguration,
  finishPreparation,
  withBrowserAction,
} from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor, assertBrowserTerms } from "./browser-action-policy.ts";
import { assertFundingSnapshot, browserMarketSnapshot } from "./browser-market.ts";
import { verifyBrowserProof } from "./browser-proof.ts";
import type { BrowserProofInput } from "./browser-proof.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { validateReservedSource } from "./preflight.ts";
import { contractInterfaces } from "./contract-reads.ts";

export async function prepareBrowserFunding(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  input: BrowserProofInput,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, terms.buyer, connectedChainId, terms.destinationEvmChainId);
  return withBrowserAction(options, async (context) => {
    const verified = await verifyBrowserProof(context, input, terms, "reserve");
    const source = await livePreflightReaders(
      context.source,
      context.destination,
      terms,
      "",
    ).source();
    validateReservedSource(source, terms, BigInt(Math.floor(Date.now() / 1000)));
    const block = await actionBlock(context.destination, "destination");
    assertFreshTimestamp(BigInt(block.timestamp), terms.fundBefore);
    await checkMarketConfiguration(context.destination, terms, block.number);
    assertFundingSnapshot(
      await browserMarketSnapshot(context.destination, terms, block.number),
      terms,
    );
    const data = contractInterfaces.market.encodeFunctionData("fundReservation", [
      input.proof,
      verified.logIndex,
      terms,
    ]);
    const prepared = await finishPreparation(
      context.destination,
      block,
      "fund",
      actor,
      "market",
      data,
      terms.fundBefore,
    );
    validateReservedSource(
      await livePreflightReaders(context.source, context.destination, terms, "").source(),
      terms,
      BigInt(Math.floor(Date.now() / 1000)),
    );
    assertFreshTimestamp(BigInt(block.timestamp), terms.fundBefore);
    return { ...prepared, terms, ...verified.identity, eventKey: verified.eventKey };
  });
}
