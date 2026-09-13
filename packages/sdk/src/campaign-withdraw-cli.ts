import { campaignName, campaignTerms } from "./campaign-config.ts";
import { campaignContext, verifyCampaignContract } from "./campaign-chain.ts";
import { campaignClaimId } from "./campaign-proof.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { marketAccounting } from "./campaign-accounting.ts";
import { quoteEconomics } from "./canonical.ts";
import { submitCampaign } from "./campaign-submit.ts";
import { ConfigurationError, errorSummary } from "./environment.ts";

const requested = process.argv[2];
const name = requested === "fee" ? "a" : campaignName(requested);
const action = requested === "fee" ? "withdraw-fee" : `${name}-withdraw`;
const role = requested === "fee" ? "PAYER" : name === "a" ? "SELLER" : "BUYER";
const context = campaignContext();
try {
  const terms = campaignTerms(name, await campaignClaimId(name));
  await campaignRecord(`${name}-${name === "a" ? "settle" : "refund"}`, "outcome-verified");
  await verifyCampaignContract(context.destination, "market");
  await verifyCampaignContract(context.destination, "settlementToken");
  const block = await context.destination.getBlock("latest");
  if (!block) throw new ConfigurationError("Destination block unavailable");
  const before = await marketAccounting(context.destination, block.number);
  const creditKey =
    role === "PAYER" ? "payerCredit" : role === "SELLER" ? "sellerCredit" : "buyerCredit";
  const balanceKey =
    role === "PAYER" ? "payerBalance" : role === "SELLER" ? "sellerBalance" : "buyerBalance";
  const economics = quoteEconomics(terms.grossPurchasePriceRaw, terms.feeBps);
  const expected =
    requested === "fee"
      ? economics.feeRaw
      : name === "a"
        ? economics.sellerNetRaw
        : terms.grossPurchasePriceRaw;
  if (before[creditKey] !== expected)
    throw new ConfigurationError(
      "Credit differs from approved single-claim withdrawal; reconcile first",
    );
  const receipt = await submitCampaign(
    context.destination,
    context.wallet(role, context.destination),
    action,
    "market",
    "withdraw",
    [],
    process.argv.includes("--broadcast"),
    { terms, role, amount: expected, before },
  );
  if (receipt) {
    const after = await marketAccounting(context.destination, receipt.blockNumber);
    if (
      after[creditKey] !== 0n ||
      after[balanceKey] !== before[balanceKey] + expected ||
      after.credits !== before.credits - expected ||
      after.liabilities !== before.liabilities - expected ||
      after.balance !== before.balance - expected ||
      after.bound !== before.bound
    )
      throw new ConfigurationError("Withdrawal recipient or liability delta mismatch");
    await recordCampaign({
      action,
      state: "withdrawal-verified",
      evidenceKind: "live-read-verified",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      role,
      amount: expected,
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
