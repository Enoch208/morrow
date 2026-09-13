import { campaignName, campaignTerms } from "./campaign-config.ts";
import {
  campaignContext,
  campaignRead,
  decodedInteger,
  verifyCampaignContract,
} from "./campaign-chain.ts";
import { campaignClaimId } from "./campaign-proof.ts";
import { recordCampaign } from "./campaign-log.ts";
import { decodedClaim, decodedTuple } from "./decoded-state.ts";
import { assertTerminalTiming } from "./campaign-terminal-policy.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const name = campaignName(process.argv[2]);
const operation = process.argv[3];
if (operation !== "cancel" && operation !== "redeem")
  throw new ConfigurationError("Choose cancel or redeem");
const action = `${name}-${operation}`;
const context = campaignContext();
try {
  const terms = campaignTerms(name, await campaignClaimId(name));
  await verifyCampaignContract(context.source, "vault");
  await verifyCampaignContract(context.source, "sourceToken");
  const block = await context.source.getBlock("latest");
  if (!block) throw new ConfigurationError("Source block unavailable");
  assertTerminalTiming(name, operation, BigInt(block.timestamp), false);
  assertTerminalTiming(name, operation, BigInt(Math.floor(Date.now() / 1000)), false);
  const beforeRead = await campaignRead(
    context.source,
    "vault",
    "getClaim",
    [terms.claimId],
    block.number,
  );
  const before = decodedClaim(beforeRead.decoded[0], terms.claimId);
  const beneficiary = name === "a" ? terms.buyer : terms.seller;
  if (
    before.currentBeneficiary !== beneficiary ||
    before.redeemed ||
    before.successfulSale !== (name === "a") ||
    before.activeRound !== (operation === "cancel" ? terms.round : 0n)
  )
    throw new ConfigurationError("Source claim differs from approved terminal path");
  const balanceBefore = await campaignRead(
    context.source,
    "sourceToken",
    "balanceOf",
    [beneficiary],
    block.number,
  );
  const backingBefore = await campaignRead(
    context.source,
    "vault",
    "totalBacking",
    [],
    block.number,
  );
  const receipt = await submitCampaign(
    context.source,
    context.wallet(name === "a" ? "BUYER" : "SELLER", context.source),
    action,
    "vault",
    operation === "cancel" ? "cancelExpiredSale" : "redeem",
    operation === "cancel" ? [terms.claimId, terms.round] : [terms.claimId],
    process.argv.includes("--broadcast"),
    { terms, beneficiary, sourceCheckBlock: block.number },
  );
  if (receipt) {
    const claimRead = await campaignRead(
      context.source,
      "vault",
      "getClaim",
      [terms.claimId],
      receipt.blockNumber,
    );
    const claim = decodedClaim(claimRead.decoded[0], terms.claimId);
    const roundRead = await campaignRead(
      context.source,
      "vault",
      "getRound",
      [terms.claimId, terms.round],
      receipt.blockNumber,
    );
    const round = decodedTuple(roundRead.decoded[0], 4);
    const balance = await campaignRead(
      context.source,
      "sourceToken",
      "balanceOf",
      [beneficiary],
      receipt.blockNumber,
    );
    const backing = await campaignRead(
      context.source,
      "vault",
      "totalBacking",
      [],
      receipt.blockNumber,
    );
    const amount = operation === "redeem" ? terms.sourceFaceValueRaw : 0n;
    if (
      claim.currentBeneficiary !== beneficiary ||
      claim.activeRound !== 0n ||
      claim.redeemed !== (operation === "redeem") ||
      claim.successfulSale !== (name === "a") ||
      decodedInteger(round[1]) !== (name === "a" ? 2n : 3n) ||
      decodedInteger(balance.decoded[0]) !== decodedInteger(balanceBefore.decoded[0]) + amount ||
      decodedInteger(backing.decoded[0]) !== decodedInteger(backingBefore.decoded[0]) - amount
    )
      throw new ConfigurationError("Terminal source post-state or token delta mismatch");
    await recordCampaign({
      action,
      state: operation === "cancel" ? "cancellation-verified" : "redemption-verified",
      evidenceKind: "live-read-verified",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      claim,
      claimRaw: claimRead.raw,
      roundRaw: roundRead.raw,
      beneficiaryBalanceRaw: balance.raw,
      backingRaw: backing.raw,
      sourceFacePaidRaw: amount,
    });
  }
} catch (error: unknown) {
  await recordCampaign({
    action,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  context.close();
}
