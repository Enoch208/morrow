import { ZeroAddress, ZeroHash } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { actionBlock, finishPreparation, withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { actionAddress, assertActor } from "./browser-action-policy.ts";
import { campaignContracts } from "./campaign-config.ts";
import { campaignRead, contractInterfaces } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";

export interface ClaimRequest {
  readonly faceValueRaw: bigint;
  readonly beneficiary: string;
  readonly maturity: bigint;
}

export const minimumMaturityLeadSeconds = 3_600n;

export function assertClaimRequest(request: ClaimRequest, payer: string, now: bigint): void {
  if (
    request.faceValueRaw <= 0n ||
    actionAddress(request.beneficiary) === ZeroAddress ||
    actionAddress(request.beneficiary) === actionAddress(payer) ||
    request.maturity < now + minimumMaturityLeadSeconds
  )
    throw new ConfigurationError(
      "Claim needs a positive amount, a separate recipient and maturity at least one hour ahead",
    );
}

async function payerSnapshot(source: JsonRpcProvider, actor: string) {
  const block = await actionBlock(source, "source");
  const [allowance, balance] = await Promise.all([
    campaignRead(
      source,
      "sourceToken",
      "allowance",
      [actor, campaignContracts.vault.address],
      block.number,
    ),
    campaignRead(source, "sourceToken", "balanceOf", [actor], block.number),
  ]);
  return {
    block,
    allowance: decodedInteger(allowance.decoded[0]),
    balance: decodedInteger(balance.decoded[0]),
  };
}

export async function prepareBrowserClaimApproval(
  request: ClaimRequest,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertActor(actor, actor, connectedChainId, 11155111n);
  return withBrowserAction(options, async ({ source }) => {
    const { block, allowance, balance } = await payerSnapshot(source, actor);
    assertClaimRequest(request, actor, BigInt(block.timestamp));
    if (balance < request.faceValueRaw)
      throw new ConfigurationError("Payer balance cannot fund this claim");
    if (allowance === request.faceValueRaw) return { status: "already-approved" } as const;
    const amount = allowance === 0n ? request.faceValueRaw : 0n;
    const prepared = await finishPreparation(
      source,
      block,
      "approve-claim",
      actor,
      "sourceToken",
      contractInterfaces.sourceToken.encodeFunctionData("approve", [
        campaignContracts.vault.address,
        amount,
      ]),
    );
    return {
      status: amount === 0n ? "reset-required" : "approval-required",
      amount,
      prepared,
    } as const;
  });
}

export async function prepareBrowserClaim(
  request: ClaimRequest,
  actor: string,
  connectedChainId: bigint,
  options: BrowserActionOptions,
) {
  assertActor(actor, actor, connectedChainId, 11155111n);
  return withBrowserAction(options, async ({ source }) => {
    const { block, allowance, balance } = await payerSnapshot(source, actor);
    assertClaimRequest(request, actor, BigInt(block.timestamp));
    if (allowance < request.faceValueRaw || balance < request.faceValueRaw)
      throw new ConfigurationError("Approve and hold the full face value before creating a claim");
    const next = await campaignRead(source, "vault", "nextClaimId", [], block.number);
    const prepared = await finishPreparation(
      source,
      block,
      "create",
      actor,
      "vault",
      contractInterfaces.vault.encodeFunctionData("createClaim", [
        campaignContracts.sourceToken.address,
        request.faceValueRaw,
        actionAddress(request.beneficiary),
        request.maturity,
        ZeroHash,
      ]),
    );
    return { ...prepared, expectedClaimId: decodedInteger(next.decoded[0]) };
  });
}
