import type { Claim } from "@morrow/protocol";
import { actionBlock, finishPreparation, withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { assertActor } from "./browser-action-policy.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedClaim } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";
import { tradeRead } from "./trade-contracts.ts";

export function assertRedeemable(claim: Claim, timestamp: bigint): void {
  if (claim.redeemed) throw new ConfigurationError("Claim already redeemed");
  if (claim.activeRound !== 0n)
    throw new ConfigurationError("Cancel the expired reservation before redeeming");
  if (timestamp < claim.maturity) throw new ConfigurationError("Claim has not matured");
}

export async function prepareBrowserRedemption(
  claimId: bigint,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertActor(actor, actor, connectedChainId, 11155111n);
  return withBrowserAction(options, async ({ source }) => {
    const block = await actionBlock(source, "source");
    const read = await tradeRead(source, "vault", "getClaim", [claimId], block.number);
    const claim = decodedClaim(read.decoded[0], claimId);
    assertRedeemable(claim, BigInt(block.timestamp));
    const prepared = await finishPreparation(
      source,
      block,
      "redeem",
      actor,
      "vault",
      contractInterfaces.vault.encodeFunctionData("redeem", [claimId]),
    );
    return {
      ...prepared,
      beneficiary: claim.currentBeneficiary,
      faceValueRaw: claim.sourceFaceValueRaw,
    };
  });
}
