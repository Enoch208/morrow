import { campaignTerms } from "./campaign-config.ts";
import { campaignContext, campaignRead, decodedInteger } from "./campaign-chain.ts";
import { campaignClaimId } from "./campaign-proof.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { decodedClaim, decodedTuple } from "./decoded-state.ts";
import { prepareAssignment } from "./preflight.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const context = campaignContext();
const broadcast = process.argv.includes("--broadcast");
try {
  const terms = campaignTerms("a", await campaignClaimId("a"));
  const funding = await campaignRecord("a-fund", "mined");
  if (typeof funding.transactionHash !== "string")
    throw new ConfigurationError("No mined A funding receipt");
  const wallet = context.wallet("SELLER", context.source);
  const prepared = await prepareAssignment(
    terms,
    wallet.address,
    (await context.source.getNetwork()).chainId,
    livePreflightReaders(context.source, context.destination, terms, funding.transactionHash),
  );
  await recordCampaign({
    action: "a-assign",
    state: "preflight-passed",
    evidenceKind: "live-read-verified",
    prepared,
  });
  const receipt = await submitCampaign(
    context.source,
    wallet,
    "a-assign",
    "vault",
    "assignSale",
    [terms.claimId, terms.round, prepared.termsHash],
    broadcast,
    {
      terms,
      saleId: prepared.saleId,
      preflightSourceBlock: prepared.sourceBlock,
      preflightDestinationBlock: prepared.destinationBlock,
    },
  );
  if (receipt) {
    const claimRead = await campaignRead(
      context.source,
      "vault",
      "getClaim",
      [terms.claimId],
      receipt.blockNumber,
    );
    const roundRead = await campaignRead(
      context.source,
      "vault",
      "getRound",
      [terms.claimId, terms.round],
      receipt.blockNumber,
    );
    const claim = decodedClaim(claimRead.decoded[0], terms.claimId);
    const round = decodedTuple(roundRead.decoded[0], 4);
    if (
      claim.currentBeneficiary !== terms.buyer ||
      claim.activeRound !== 0n ||
      !claim.successfulSale ||
      decodedInteger(round[1]) !== 2n
    )
      throw new ConfigurationError("Source assignment post-state mismatch");
    await recordCampaign({
      action: "a-assign",
      state: "assignment-verified",
      evidenceKind: "live-read-verified",
      transactionHash: receipt.hash,
      claim,
      claimRaw: claimRead.raw,
      roundRaw: roundRead.raw,
      holdProofUntil: terms.maturity,
    });
  }
} catch (error: unknown) {
  await recordCampaign({
    action: "a-assign",
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  context.close();
}
