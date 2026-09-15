import { actionBlock, finishPreparation, withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor } from "./browser-action-policy.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";
import { tradeRead } from "./trade-contracts.ts";

export async function prepareBrowserWithdrawal(
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertActor(actor, actor, connectedChainId, 102031n);
  return withBrowserAction(options, async ({ destination }) => {
    const block = await actionBlock(destination, "destination");
    const read = await tradeRead(destination, "market", "credits", [actor], block.number);
    const creditRaw = decodedInteger(read.decoded[0]);
    if (creditRaw <= 0n) throw new ConfigurationError("Caller has no withdrawable credit");
    const prepared = await finishPreparation(
      destination,
      block,
      "withdraw",
      actor,
      "market",
      contractInterfaces.market.encodeFunctionData("withdraw"),
    );
    return { ...prepared, creditRaw };
  });
}
