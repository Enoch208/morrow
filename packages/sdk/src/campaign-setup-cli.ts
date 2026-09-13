import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { campaignContext, campaignRead, decodedInteger } from "./campaign-chain.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { recordCampaign } from "./campaign-log.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const action = process.argv[2];
const broadcast = process.argv.includes("--broadcast");
const context = campaignContext();
try {
  if (action === "approve-source") {
    const allowance = await campaignRead(context.source, "sourceToken", "allowance", [
      campaignActors.PAYER,
      campaignContracts.vault.address,
    ]);
    if (decodedInteger(allowance.decoded[0]) !== 0n)
      throw new ConfigurationError("Source allowance is not initially zero");
    await submitCampaign(
      context.source,
      context.wallet("PAYER", context.source),
      action,
      "sourceToken",
      "approve",
      [campaignContracts.vault.address, 20010000000n],
      broadcast,
    );
  } else if (action === "supply-buyer") {
    const balance = await campaignRead(context.destination, "settlementToken", "balanceOf", [
      campaignActors.BUYER,
    ]);
    if (decodedInteger(balance.decoded[0]) !== 0n)
      throw new ConfigurationError("Buyer token balance is not initially zero");
    await submitCampaign(
      context.destination,
      context.wallet("PAYER", context.destination),
      action,
      "settlementToken",
      "transfer",
      [campaignActors.BUYER, 18829410000n],
      broadcast,
    );
  } else if (action === "approve-settlement") {
    const allowance = await campaignRead(context.destination, "settlementToken", "allowance", [
      campaignActors.BUYER,
      campaignContracts.market.address,
    ]);
    if (decodedInteger(allowance.decoded[0]) !== 0n)
      throw new ConfigurationError("Destination allowance is not initially zero");
    await submitCampaign(
      context.destination,
      context.wallet("BUYER", context.destination),
      action,
      "settlementToken",
      "approve",
      [campaignContracts.market.address, 18829410000n],
      broadcast,
    );
  } else throw new ConfigurationError("Choose approve-source, supply-buyer or approve-settlement");
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
