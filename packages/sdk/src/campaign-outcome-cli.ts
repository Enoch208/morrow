import { campaignName, campaignTerms } from "./campaign-config.ts";
import {
  campaignContext,
  campaignRead,
  decodedInteger,
  verifyCampaignContract,
} from "./campaign-chain.ts";
import { campaignClaimId, buildCampaignProof } from "./campaign-proof.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { decodedClaim, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { assertTerminalTiming } from "./campaign-terminal-policy.ts";
import { heldAssignmentProof } from "./campaign-held-proof.ts";
import { marketAccounting } from "./campaign-accounting.ts";
import { encodeTerms, quoteEconomics, saleIdentity } from "./canonical.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const name = campaignName(process.argv[2]);
const action = `${name}-${name === "a" ? "settle" : "refund"}`;
const context = campaignContext();
try {
  const terms = campaignTerms(name, await campaignClaimId(name));
  const identity = saleIdentity(terms);
  await verifyCampaignContract(context.source, "vault");
  await verifyCampaignContract(context.destination, "market");
  await verifyCampaignContract(context.destination, "settlementToken");
  let bundle;
  if (name === "a") {
    await campaignRecord("a-redeem", "redemption-verified");
    const block = await context.source.getBlock("latest");
    if (!block) throw new ConfigurationError("Source block unavailable");
    const read = await campaignRead(
      context.source,
      "vault",
      "getClaim",
      [terms.claimId],
      block.number,
    );
    const claim = decodedClaim(read.decoded[0], terms.claimId);
    if (claim.currentBeneficiary !== terms.buyer || !claim.successfulSale)
      throw new ConfigurationError("A assignment/redemption ownership mismatch");
    assertTerminalTiming(name, "settle", BigInt(block.timestamp), claim.redeemed);
    assertTerminalTiming(name, "settle", BigInt(Math.floor(Date.now() / 1000)), claim.redeemed);
    const held = await heldAssignmentProof(context.destination);
    bundle = {
      proof: held.proof,
      logIndex: held.logIndex,
      proofPath: held.record.proofPath,
      proofHash: held.record.proofHash,
      eventKey: held.record.eventKey,
    };
  } else {
    await campaignRecord(`${name}-cancel`, "cancellation-verified");
    bundle = await buildCampaignProof(context.source, context.destination, name, "cancel");
  }
  const beforeBlock = await context.destination.getBlock("latest");
  if (!beforeBlock) throw new ConfigurationError("Destination block unavailable");
  const before = await marketAccounting(context.destination, beforeBlock.number);
  const receipt = await submitCampaign(
    context.destination,
    context.wallet("BUYER", context.destination),
    action,
    "market",
    name === "a" ? "settleAssignment" : "recognizeCancellation",
    [bundle.proof, bundle.logIndex, identity.saleId],
    process.argv.includes("--broadcast"),
    {
      terms,
      ...identity,
      proofPath: bundle.proofPath,
      proofHash: bundle.proofHash,
      eventKey: bundle.eventKey,
      before,
    },
  );
  if (receipt) {
    const read = await campaignRead(
      context.destination,
      "market",
      "getSale",
      [identity.saleId],
      receipt.blockNumber,
    );
    const sale = decodedTuple(read.decoded[0], 2);
    const after = await marketAccounting(context.destination, receipt.blockNumber);
    const consumed = await campaignRead(
      context.destination,
      "market",
      "consumed",
      [bundle.eventKey],
      receipt.blockNumber,
    );
    const { sellerNetRaw, feeRaw } = quoteEconomics(terms.grossPurchasePriceRaw, terms.feeBps);
    if (
      decodedInteger(sale[1]) !== (name === "a" ? 2n : 3n) ||
      encodeTerms(decodedTerms(sale[0])) !== encodeTerms(terms) ||
      consumed.decoded[0] !== true ||
      after.bound !== before.bound - terms.grossPurchasePriceRaw ||
      after.credits !== before.credits + terms.grossPurchasePriceRaw ||
      after.liabilities !== before.liabilities ||
      after.balance !== before.balance ||
      after.payerCredit !== before.payerCredit + (name === "a" ? feeRaw : 0n) ||
      after.sellerCredit !== before.sellerCredit + (name === "a" ? sellerNetRaw : 0n) ||
      after.buyerCredit !== before.buyerCredit + (name === "a" ? 0n : terms.grossPurchasePriceRaw)
    )
      throw new ConfigurationError("Outcome allocation or exact sale mismatch");
    await recordCampaign({
      action,
      state: "outcome-verified",
      evidenceKind: "live-read-verified",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      saleRaw: read.raw,
      consumedRaw: consumed.raw,
      proofHash: bundle.proofHash,
      before,
      after,
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
