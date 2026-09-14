import type { SaleTerms } from "@morrow/protocol";
import {
  actionBlock,
  checkMarketConfiguration,
  finishPreparation,
  withBrowserAction,
} from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor, assertBrowserTerms } from "./browser-action-policy.ts";
import { browserMarketSnapshot } from "./browser-market.ts";
import { verifyBrowserProof } from "./browser-proof.ts";
import type { BrowserProofInput } from "./browser-proof.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import type { SourcePreflightRead } from "./preflight.ts";
import { ConfigurationError } from "./errors.ts";

export function assertCancellableSource(read: SourcePreflightRead, terms: SaleTerms): void {
  if (read.state !== 1n || read.activeRound !== terms.round)
    throw new ConfigurationError("Only a still-reserved round can be cancelled");
  if (read.timestamp < terms.assignBefore)
    throw new ConfigurationError("Cancellation opens at the assignment deadline");
}

export async function prepareBrowserCancellation(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, actor, connectedChainId, terms.sourceEvmChainId);
  return withBrowserAction(options, async ({ source, destination }) => {
    const read = await livePreflightReaders(source, destination, terms, "").source();
    assertCancellableSource(read, terms);
    const block = await actionBlock(source, "source");
    const prepared = await finishPreparation(
      source,
      block,
      "cancel",
      actor,
      "vault",
      contractInterfaces.vault.encodeFunctionData("cancelExpiredSale", [
        terms.claimId,
        terms.round,
      ]),
    );
    return { ...prepared, terms };
  });
}

export async function prepareBrowserCancellationRecognition(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  input: BrowserProofInput,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, actor, connectedChainId, terms.destinationEvmChainId);
  return withBrowserAction(options, async (context) => {
    const verified = await verifyBrowserProof(context, input, terms, "cancel");
    const block = await actionBlock(context.destination, "destination");
    await checkMarketConfiguration(context.destination, terms, block.number);
    const snapshot = await browserMarketSnapshot(context.destination, terms, block.number);
    if (snapshot.state !== 1n)
      throw new ConfigurationError("Only a funded sale can recognize its cancellation");
    const prepared = await finishPreparation(
      context.destination,
      block,
      "recognize",
      actor,
      "market",
      contractInterfaces.market.encodeFunctionData("recognizeCancellation", [
        input.proof,
        verified.logIndex,
        verified.identity.saleId,
      ]),
    );
    return { ...prepared, terms, ...verified.identity, eventKey: verified.eventKey };
  });
}
