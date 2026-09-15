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
import { contractInterfaces } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";
import { tradeRead } from "./trade-contracts.ts";

export async function prepareBrowserFundingApproval(
  terms: SaleTerms,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertBrowserTerms(terms);
  assertActor(actor, terms.buyer, connectedChainId, terms.destinationEvmChainId);
  return withBrowserAction(options, async ({ destination }) => {
    const block = await actionBlock(destination, "destination");
    assertFreshTimestamp(BigInt(block.timestamp), terms.fundBefore);
    await checkMarketConfiguration(destination, terms, block.number);
    const [allowanceRead, balance] = await Promise.all([
      tradeRead(
        destination,
        "settlementToken",
        "allowance",
        [actor, terms.destinationMarket],
        block.number,
      ),
      tradeRead(destination, "settlementToken", "balanceOf", [actor], block.number),
    ]);
    if (decodedInteger(balance.decoded[0]) < terms.grossPurchasePriceRaw)
      throw new ConfigurationError("Buyer balance cannot cover purchase price");
    const allowance = decodedInteger(allowanceRead.decoded[0]);
    if (allowance === terms.grossPurchasePriceRaw)
      return { status: "already-approved", allowance } as const;
    const amount = allowance === 0n ? terms.grossPurchasePriceRaw : 0n;
    const data = contractInterfaces.settlementToken.encodeFunctionData("approve", [
      terms.destinationMarket,
      amount,
    ]);
    const prepared = await finishPreparation(
      destination,
      block,
      "approve",
      actor,
      "settlementToken",
      data,
      terms.fundBefore,
    );
    return {
      status: amount === 0n ? "reset-required" : "approval-required",
      amount,
      prepared,
    } as const;
  });
}
