import { proofProvider } from "@gluwa/usc-sdk";
import { campaignName } from "./campaign-config.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { campaignContext } from "./campaign-chain.ts";
import { ConfigurationError, errorSummary, proverEndpoints } from "./environment.ts";

const name = campaignName(process.argv[2]);
const event = process.argv[3];
if (event !== "reserve" && event !== "assign" && event !== "cancel")
  throw new ConfigurationError("Choose reserve, assign or cancel");
const action = `${name}-${event}-wait`;
const context = campaignContext();
try {
  const entry = await campaignRecord(`${name}-${event}`, "mined");
  if (typeof entry.transactionHash !== "string")
    throw new ConfigurationError("Missing source transaction hash");
  const receipt = await context.source.getTransactionReceipt(entry.transactionHash);
  if (receipt?.status !== 1) throw new ConfigurationError("Source receipt unavailable");
  const block = await context.source.getBlock(receipt.blockHash);
  if (!block) throw new ConfigurationError("Source block unavailable");
  await recordCampaign({
    action,
    state: "waiting-attestation",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    sourceBlock: block.number,
    sourceTimestamp: block.timestamp,
  });
  await new proofProvider.service.ProofBuilder(
    1,
    proverEndpoints[0],
    12000,
  ).waitUntilHeightAttested(1, block.number, 15000, 900000, 5000);
  await recordCampaign({
    action,
    state: "attestation-observed",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    sourceBlock: block.number,
    sourceTimestamp: block.timestamp,
    inclusionToObservedMs: Date.now() - block.timestamp * 1000,
  });
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
