import type { SaleTerms } from "@morrow/protocol";
import {
  actionBlock,
  checkMarketConfiguration,
  finishPreparation,
  withBrowserAction,
} from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import {
  assertActor,
  assertBrowserTerms,
  assertReservationClaim,
} from "./browser-action-policy.ts";
import { campaignRead, contractInterfaces } from "./contract-reads.ts";
import { decodedClaim, decodedInteger } from "./decoded-state.ts";
import { saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export async function prepareBrowserReservation(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, terms.seller, connectedChainId, terms.sourceEvmChainId);
  return withBrowserAction(options, async ({ source, destination }) => {
    const [block, destinationBlock] = await Promise.all([
      actionBlock(source, "source"),
      actionBlock(destination, "destination"),
    ]);
    await checkMarketConfiguration(destination, terms, destinationBlock.number);
    const [read, backing, balance] = await Promise.all([
      campaignRead(source, "vault", "getClaim", [terms.claimId], block.number),
      campaignRead(source, "vault", "totalBacking", [], block.number),
      campaignRead(source, "sourceToken", "balanceOf", [terms.sourceVault], block.number),
    ]);
    assertReservationClaim(
      decodedClaim(read.decoded[0], terms.claimId),
      terms,
      BigInt(block.timestamp),
    );
    if (
      decodedInteger(backing.decoded[0]) < terms.sourceFaceValueRaw ||
      decodedInteger(balance.decoded[0]) < decodedInteger(backing.decoded[0])
    )
      throw new ConfigurationError("Claim backing is not covered");
    const data = contractInterfaces.vault.encodeFunctionData("reserveSale", [terms.claimId, terms]);
    const prepared = await finishPreparation(
      source,
      block,
      "reserve",
      actor,
      "vault",
      data,
      terms.fundBefore,
    );
    return { ...prepared, terms, ...saleIdentity(terms) };
  });
}
