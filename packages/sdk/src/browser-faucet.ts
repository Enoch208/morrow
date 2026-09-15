import { actionBlock, finishPreparationFor, withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor } from "./browser-action-policy.ts";
import { decodedAddress, decodedInteger } from "./decoded-state.ts";
import { faucetInterface, faucetRead, verifyFaucet } from "./faucet-pins.ts";
import type { FaucetSide } from "./faucet-pins.ts";
import { ConfigurationError } from "./errors.ts";
import { tradeRead } from "./trade-contracts.ts";

export interface FaucetStatus {
  readonly dripRaw: bigint;
  readonly faucetBalanceRaw: bigint;
  readonly nextDripAt: bigint;
}

export function assertDripAvailable(status: FaucetStatus, now: bigint): void {
  if (now < status.nextDripAt)
    throw new ConfigurationError("This wallet already received test tokens in the last 24 hours");
  if (status.faucetBalanceRaw < status.dripRaw)
    throw new ConfigurationError("Faucet is empty; ask the Morrow team to refill it");
}

export async function prepareBrowserFaucetDrip(
  side: FaucetSide,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  const requiredChain = side === "source" ? 11155111n : 102031n;
  assertActor(actor, actor, connectedChainId, requiredChain);
  return withBrowserAction(options, async ({ source, destination }) => {
    const rpc = side === "source" ? source : destination;
    const block = await actionBlock(rpc, side === "source" ? "source" : "destination");
    const pin = await verifyFaucet(rpc, side, block.number);
    const [token, drip, next, balance] = await Promise.all([
      faucetRead(rpc, side, "TOKEN", [], block.number),
      faucetRead(rpc, side, "DRIP_AMOUNT", [], block.number),
      faucetRead(rpc, side, "nextDripAt", [actor], block.number),
      tradeRead(
        rpc,
        side === "source" ? "sourceToken" : "settlementToken",
        "balanceOf",
        [pin.address],
        block.number,
      ),
    ]);
    if (decodedAddress(token) !== decodedAddress(pin.token))
      throw new ConfigurationError("Faucet is bound to an unexpected token");
    const status = {
      dripRaw: decodedInteger(drip),
      faucetBalanceRaw: decodedInteger(balance.decoded[0]),
      nextDripAt: decodedInteger(next),
    };
    assertDripAvailable(status, BigInt(block.timestamp));
    const prepared = await finishPreparationFor(
      rpc,
      block,
      "drip",
      actor,
      pin,
      faucetInterface.encodeFunctionData("drip"),
    );
    return { ...prepared, ...status };
  });
}
