import { isError } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts, campaignTerms } from "./campaign-config.ts";
import { campaignContext, verifyCampaignContract } from "./campaign-chain.ts";
import { campaignClaimId, buildCampaignProof } from "./campaign-proof.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

async function rejectedCall(
  rpc: JsonRpcProvider,
  kind: "vault" | "market",
  data: string,
  expected: string,
) {
  const abi = await verifyCampaignContract(rpc, kind);
  const block = await rpc.getBlock("latest");
  if (!block) throw new ConfigurationError("Rejection block unavailable");
  let reverted: string | null = null;
  try {
    await rpc.call({
      to: campaignContracts[kind].address,
      from: campaignActors.BUYER,
      data,
      blockTag: block.number,
    });
  } catch (error: unknown) {
    if (!isError(error, "CALL_EXCEPTION") || !error.data) throw error;
    reverted = error.data;
  }
  if (!reverted) throw new ConfigurationError("Expected application refusal did not occur");
  const parsed = abi.parseError(reverted);
  if (parsed?.name !== expected)
    throw new ConfigurationError("Unexpected application rejection; inspect authentic error");
  return {
    kind,
    calldata: data,
    blockNumber: block.number,
    blockHash: block.hash,
    revertData: reverted,
    actualError: parsed.name,
    mined: false,
  };
}

const context = campaignContext();
try {
  await campaignRecord("a-assign", "assignment-verified");
  const a = campaignTerms("a", await campaignClaimId("a"));
  const bundle = await buildCampaignProof(context.source, context.destination, "b", "reserve");
  const marketAbi = await verifyCampaignContract(context.destination, "market");
  const wrongSale = await rejectedCall(
    context.destination,
    "market",
    marketAbi.encodeFunctionData("fundReservation", [bundle.proof, bundle.logIndex, a]),
    "SaleIdMismatch",
  );
  await recordCampaign({
    action: "wrong-sale-proof",
    state: "rejection-verified",
    evidenceKind: "live-read-verified",
    proofPath: bundle.proofPath,
    proofHash: bundle.proofHash,
    authenticSourceEventKey: bundle.eventKey,
    proofNativeVerifiedWithSameBytes: true,
    ...wrongSale,
  });
  const sourceAbi = await verifyCampaignContract(context.source, "vault");
  const afterAssignment = await rejectedCall(
    context.source,
    "vault",
    sourceAbi.encodeFunctionData("cancelExpiredSale", [a.claimId, a.round]),
    "RoundMismatch",
  );
  await recordCampaign({
    action: "assigned-cancel-refusal",
    state: "rejection-verified",
    evidenceKind: "live-read-verified",
    ...afterAssignment,
  });
} catch (error: unknown) {
  await recordCampaign({
    action: "campaign-rejections",
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  context.close();
}
