import { ZeroHash } from "ethers";
import {
  assertLaunchWindow,
  campaignActors,
  campaignContracts,
  campaignName,
  campaignTerms,
} from "./campaign-config.ts";
import {
  campaignContext,
  campaignRead,
  decodedInteger,
  verifyCampaignContract,
} from "./campaign-chain.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { decodedClaim, decodedHash, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const name = campaignName(process.argv[2]);
const operation = process.argv[3];
if (operation !== "create" && operation !== "reserve")
  throw new ConfigurationError("Choose create or reserve");
const action = `${name}-${operation}`;
const broadcast = process.argv.includes("--broadcast");
const context = campaignContext();
try {
  const block = await context.source.getBlock("latest");
  if (!block) throw new ConfigurationError("Source block unavailable");
  assertLaunchWindow(name, BigInt(Math.max(block.timestamp, Math.floor(Date.now() / 1000))));
  await verifyCampaignContract(context.source, "sourceToken");
  const abi = await verifyCampaignContract(context.source, "vault");
  if (name !== "gate") await campaignRecord("gate-fund", "bound-verified");
  if (operation === "create") {
    const terms = campaignTerms(name, 0n);
    const payer = context.wallet("PAYER", context.source);
    await recordCampaign({
      action,
      state: "deadline-commitment",
      evidenceKind: "proposed",
      claimId: null,
      sourceFaceValueRaw: terms.sourceFaceValueRaw,
      grossPurchasePriceRaw: terms.grossPurchasePriceRaw,
      maturity: terms.maturity,
      fundBefore: terms.fundBefore,
      assignBefore: terms.assignBefore,
      sourceBlock: block.number,
      sourceTimestamp: block.timestamp,
    });
    const receipt = await submitCampaign(
      context.source,
      payer,
      action,
      "vault",
      "createClaim",
      [
        terms.sourceToken,
        terms.sourceFaceValueRaw,
        campaignActors.SELLER,
        terms.maturity,
        ZeroHash,
      ],
      broadcast,
    );
    if (receipt) {
      const logs = receipt.logs.filter(
        (log) =>
          log.address.toLowerCase() === campaignContracts.vault.address.toLowerCase() &&
          log.topics[0] === abi.getEvent("ClaimFunded")?.topicHash,
      );
      const selected = logs[0];
      if (!selected || logs.length !== 1) throw new ConfigurationError("Ambiguous creation event");
      const event = abi.parseLog(selected);
      if (!event) throw new ConfigurationError("Creation log decode failed");
      const claimId = decodedInteger(event.args[0]);
      const result = await campaignRead(
        context.source,
        "vault",
        "getClaim",
        [claimId],
        receipt.blockNumber,
      );
      const claim = decodedClaim(result.decoded[0], claimId);
      if (
        claim.sourceToken !== terms.sourceToken ||
        claim.sourceFaceValueRaw !== terms.sourceFaceValueRaw ||
        claim.maturity !== terms.maturity ||
        claim.originalBeneficiary !== terms.seller ||
        claim.currentBeneficiary !== terms.seller ||
        claim.activeRound !== 0n ||
        claim.latestRound !== 0n ||
        claim.redeemed ||
        claim.successfulSale ||
        claim.referenceHash !== ZeroHash
      )
        throw new ConfigurationError("Created claim differs from approval");
      await recordCampaign({
        action,
        state: "claim-verified",
        evidenceKind: "live-read-verified",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        claimId,
        claim,
        raw: result.raw,
      });
    }
  } else {
    const record = await campaignRecord(`${name}-create`, "claim-verified");
    if (typeof record.claimId !== "string" || !/^\d+$/.test(record.claimId))
      throw new ConfigurationError("Invalid stored claim ID");
    const claimId = BigInt(record.claimId);
    const terms = campaignTerms(name, claimId);
    const identity = saleIdentity(terms);
    const receipt = await submitCampaign(
      context.source,
      context.wallet("SELLER", context.source),
      action,
      "vault",
      "reserveSale",
      [claimId, terms],
      broadcast,
      { terms, ...identity },
    );
    if (receipt) {
      const read = await campaignRead(
        context.source,
        "vault",
        "getRound",
        [claimId, 1n],
        receipt.blockNumber,
      );
      const round = decodedTuple(read.decoded[0], 4);
      if (
        decodedInteger(round[1]) !== 1n ||
        decodedHash(round[2]) !== identity.saleId ||
        decodedHash(round[3]) !== identity.termsHash ||
        encodeTerms(decodedTerms(round[0])) !== encodeTerms(terms)
      )
        throw new ConfigurationError("Reserved round differs from exact terms");
      await recordCampaign({
        action,
        state: "reservation-verified",
        evidenceKind: "live-read-verified",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        ...identity,
        terms,
        raw: read.raw,
      });
    }
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
