import { isError } from "ethers";
import {
  campaignContext,
  campaignRead,
  decodedInteger,
  verifyCampaignContract,
} from "./campaign-chain.ts";
import { campaignTerms } from "./campaign-config.ts";
import { campaignClaimId } from "./campaign-proof.ts";
import { recordCampaign } from "./campaign-log.ts";
import { decodedTuple } from "./decoded-state.ts";
import { saleIdentity } from "./canonical.ts";
import { marketAccounting } from "./campaign-accounting.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const context = campaignContext();
try {
  const terms = campaignTerms("a", await campaignClaimId("a"));
  const sourceBlock = await context.source.getBlock("latest");
  const destinationBlock = await context.destination.getBlock("latest");
  if (
    !sourceBlock ||
    !destinationBlock ||
    BigInt(sourceBlock.timestamp) < terms.assignBefore ||
    BigInt(destinationBlock.timestamp) < terms.assignBefore
  )
    throw new ConfigurationError("A assignment deadline has not passed on both chains");
  const abi = await verifyCampaignContract(context.source, "vault", sourceBlock.number);
  await verifyCampaignContract(context.destination, "market", destinationBlock.number);
  const data = abi.encodeFunctionData("cancelExpiredSale", [terms.claimId, terms.round]);
  let revertData: string | null = null;
  try {
    await context.source.call({
      to: terms.sourceVault,
      from: terms.buyer,
      data,
      blockTag: sourceBlock.number,
    });
  } catch (error: unknown) {
    if (!isError(error, "CALL_EXCEPTION") || !error.data) throw error;
    revertData = error.data;
  }
  if (!revertData || abi.parseError(revertData)?.name !== "RoundMismatch")
    throw new ConfigurationError("Assigned A did not reject cancellation as expected");
  const sale = await campaignRead(
    context.destination,
    "market",
    "getSale",
    [saleIdentity(terms).saleId],
    destinationBlock.number,
  );
  const accounting = await marketAccounting(context.destination, destinationBlock.number);
  if (
    decodedInteger(decodedTuple(sale.decoded[0], 2)[1]) !== 1n ||
    accounting.bound < terms.grossPurchasePriceRaw
  )
    throw new ConfigurationError("A did not remain BOUND while assignment proof was held");
  await recordCampaign({
    action: "a-deadline-check",
    state: "delay-safety-verified",
    evidenceKind: "live-read-verified",
    sourceBlock: sourceBlock.number,
    sourceBlockHash: sourceBlock.hash,
    sourceTimestamp: sourceBlock.timestamp,
    destinationBlock: destinationBlock.number,
    destinationBlockHash: destinationBlock.hash,
    destinationTimestamp: destinationBlock.timestamp,
    sourceCalldata: data,
    actualError: "RoundMismatch",
    revertData,
    mined: false,
    destinationSaleRaw: sale.raw,
    accounting,
  });
} catch (error: unknown) {
  await recordCampaign({
    action: "a-deadline-check",
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  context.close();
}
