import { campaignContext } from "./campaign-chain.ts";
import { campaignName } from "./campaign-config.ts";
import { buildCampaignProof } from "./campaign-proof.ts";
import { recordCampaign } from "./campaign-log.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const name = campaignName(process.argv[2]);
const event = process.argv[3];
if (event !== "assign" && event !== "cancel" && event !== "reserve")
  throw new ConfigurationError("Choose reserve, assign or cancel");
const context = campaignContext();
try {
  const proof = await buildCampaignProof(context.source, context.destination, name, event);
  await recordCampaign({
    action: `${name}-${event}-archive`,
    state: "archived",
    evidenceKind: "live-read-verified",
    proofHash: proof.proofHash,
    proofPath: proof.proofPath,
    submittedToMarket: false,
  });
} catch (error: unknown) {
  await recordCampaign({
    action: `${name}-${event}-archive`,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  context.close();
}
