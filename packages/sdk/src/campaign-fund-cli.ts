import { campaignContracts, campaignName } from "./campaign-config.ts";
import {
  campaignContext,
  campaignRead,
  decodedInteger,
  verifyCampaignContract,
} from "./campaign-chain.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { buildCampaignProof } from "./campaign-proof.ts";
import { decodedClaim, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { encodeTerms } from "./canonical.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const name = campaignName(process.argv[2]);
const action = `${name}-fund`;
const broadcast = process.argv.includes("--broadcast");
const context = campaignContext();
try {
  if (name !== "gate") await campaignRecord("gate-fund", "bound-verified");
  await verifyCampaignContract(context.source, "vault");
  await verifyCampaignContract(context.destination, "market");
  await verifyCampaignContract(context.destination, "settlementToken");
  const bundle = await buildCampaignProof(context.source, context.destination, name, "reserve");
  const { terms, identity } = bundle;
  const sourceRead = await campaignRead(context.source, "vault", "getClaim", [terms.claimId]);
  const claim = decodedClaim(sourceRead.decoded[0], terms.claimId);
  if (
    claim.currentBeneficiary !== terms.seller ||
    claim.activeRound !== 1n ||
    claim.redeemed ||
    claim.successfulSale
  )
    throw new ConfigurationError("Historical reservation is no longer available");
  const before = await campaignRead(context.destination, "market", "totalLiabilities");
  const beforeBalance = await campaignRead(context.destination, "settlementToken", "balanceOf", [
    campaignContracts.market.address,
  ]);
  const receipt = await submitCampaign(
    context.destination,
    context.wallet("BUYER", context.destination),
    action,
    "market",
    "fundReservation",
    [bundle.proof, bundle.logIndex, terms],
    broadcast,
    {
      terms,
      ...identity,
      proofPath: bundle.proofPath,
      proofHash: bundle.proofHash,
      eventKey: bundle.eventKey,
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
    if (decodedInteger(sale[1]) !== 1n || encodeTerms(decodedTerms(sale[0])) !== encodeTerms(terms))
      throw new ConfigurationError("Mined sale is not exact BOUND");
    const liability = await campaignRead(
      context.destination,
      "market",
      "totalLiabilities",
      [],
      receipt.blockNumber,
    );
    const balance = await campaignRead(
      context.destination,
      "settlementToken",
      "balanceOf",
      [campaignContracts.market.address],
      receipt.blockNumber,
    );
    const consumed = await campaignRead(
      context.destination,
      "market",
      "consumed",
      [bundle.eventKey],
      receipt.blockNumber,
    );
    if (
      decodedInteger(liability.decoded[0]) !==
        decodedInteger(before.decoded[0]) + terms.grossPurchasePriceRaw ||
      decodedInteger(balance.decoded[0]) !==
        decodedInteger(beforeBalance.decoded[0]) + terms.grossPurchasePriceRaw ||
      decodedInteger(balance.decoded[0]) < decodedInteger(liability.decoded[0]) ||
      consumed.decoded[0] !== true
    )
      throw new ConfigurationError("Mined funding accounting or consumption mismatch");
    await recordCampaign({
      action,
      state: "bound-verified",
      evidenceKind: "live-read-verified",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      terms,
      ...identity,
      proofHash: bundle.proofHash,
      proofPath: bundle.proofPath,
      eventKey: bundle.eventKey,
      saleRaw: read.raw,
      liabilitiesRaw: liability.raw,
      tokenBalanceRaw: balance.raw,
      consumedRaw: consumed.raw,
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
