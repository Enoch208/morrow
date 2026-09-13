import { ZeroHash } from "ethers";
import { campaignActors } from "./campaign-config.ts";
import { verifyCampaignContract } from "./contract-reads.ts";
import { sourceSnapshot, creationClaimId, checkEvent } from "./c5-source-io.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Record, c5Records, recordC5 } from "./c5-log.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import {
  assertC5SourceNotSubmitted,
  assertC5SourceWindow,
  checkC5SourceEligibility,
  checkC5SourceTransition,
} from "./c5-source-checks.ts";
import type { C5SourceOperation } from "./c5-source-checks.ts";
import { ConfigurationError } from "./errors.ts";

const actions = {
  create: "c5-create",
  reserve1: "c5-r1-reserve",
  cancel1: "c5-r1-cancel",
  reserve2: "c5-r2-reserve",
  cancel2: "c5-r2-cancel",
  redeem: "c5-redeem",
} as const;

export async function c5Source(
  context: C5Context,
  operation: C5SourceOperation,
  broadcast: boolean,
): Promise<void> {
  const action = actions[operation];
  assertC5SourceNotSubmitted(await c5Records(), action);
  if (operation === "create" || operation === "reserve1") await c5Record("c5-readiness", "ready");
  if (operation === "reserve2") await c5Record("c5-r1-cancel", "cancellation-verified");
  const claimId = operation === "create" ? null : await c5ClaimId();
  let terms = c5Terms(claimId ?? 0n, operation === "reserve2" || operation === "cancel2" ? 2n : 1n);
  await verifyCampaignContract(context.source, "vault");
  await verifyCampaignContract(context.source, "sourceToken");
  const block = await context.source.getBlock("latest");
  if (!block?.hash) throw new ConfigurationError("C5 source block unavailable");
  assertC5SourceWindow(
    operation,
    BigInt(block.timestamp),
    BigInt(Math.floor(Date.now() / 1000)),
    terms,
  );
  let before = await sourceSnapshot(context, block.number, claimId);
  if (before.blockHash !== block.hash)
    throw new ConfigurationError("C5 initial source block changed");
  checkC5SourceEligibility(operation, terms, before.snapshot);
  const beneficiary = before.snapshot.claim?.successfulSale ? terms.buyer : terms.seller;
  const method =
    operation === "create"
      ? "createClaim"
      : operation.startsWith("reserve")
        ? "reserveSale"
        : operation.startsWith("cancel")
          ? "cancelExpiredSale"
          : "redeem";
  const args =
    operation === "create"
      ? [terms.sourceToken, terms.sourceFaceValueRaw, terms.seller, terms.maturity, ZeroHash]
      : method === "reserveSale"
        ? [terms.claimId, terms]
        : method === "cancelExpiredSale"
          ? [terms.claimId, terms.round]
          : [terms.claimId];
  const role =
    operation === "create"
      ? "PAYER"
      : operation === "redeem" && before.snapshot.claim?.successfulSale
        ? "BUYER"
        : "SELLER";
  const receipt = await submitC5(
    context,
    action,
    role,
    "vault",
    method,
    args,
    broadcast,
    {
      terms: operation === "create" ? { ...terms, claimId: null } : terms,
      claimId,
      beneficiary,
      sourceCheckBlock: block.number,
      sourceCheckBlockHash: block.hash,
      sourceTimestamp: block.timestamp,
      before,
    },
    async () => {
      const latest = await context.source.getBlock("latest");
      if (!latest?.hash) throw new ConfigurationError("C5 source signing block unavailable");
      assertC5SourceWindow(
        operation,
        BigInt(latest.timestamp),
        BigInt(Math.floor(Date.now() / 1000)),
        terms,
      );
      before = await sourceSnapshot(context, latest.number, claimId);
      if (before.blockHash !== latest.hash)
        throw new ConfigurationError("C5 signing source block changed");
      checkC5SourceEligibility(operation, terms, before.snapshot);
    },
  );
  if (!receipt) return;
  if (operation === "create") {
    terms = c5Terms(creationClaimId(receipt), 1n);
  }
  const afterBlock = await context.source.getBlock(receipt.blockNumber);
  if (!afterBlock?.hash || afterBlock.hash !== receipt.blockHash)
    throw new ConfigurationError("C5 source receipt block changed");
  assertC5SourceWindow(
    operation,
    BigInt(afterBlock.timestamp),
    BigInt(afterBlock.timestamp),
    terms,
  );
  const after = await sourceSnapshot(context, receipt.blockNumber, terms.claimId);
  if (after.blockHash !== receipt.blockHash)
    throw new ConfigurationError("C5 post-state block changed");
  checkC5SourceTransition(operation, terms, before.snapshot, after.snapshot);
  const identity = saleIdentity(terms);
  const eventName =
    operation === "create"
      ? "ClaimFunded"
      : method === "reserveSale"
        ? "SaleReserved"
        : method === "cancelExpiredSale"
          ? "SaleCancelled"
          : "ClaimRedeemed";
  const expected =
    operation === "create"
      ? [
          terms.claimId,
          campaignActors.PAYER,
          terms.seller,
          terms.sourceToken,
          terms.sourceFaceValueRaw,
          terms.maturity,
          ZeroHash,
        ]
      : operation === "redeem"
        ? [terms.claimId, beneficiary, terms.sourceToken, terms.sourceFaceValueRaw]
        : [
            identity.saleId,
            terms.claimId,
            terms.round,
            identity.termsHash,
            ...(method === "reserveSale" ? [encodeTerms(terms)] : []),
          ];
  const event = checkEvent(receipt, eventName, expected);
  await recordC5({
    action,
    state:
      operation === "create"
        ? "claim-verified"
        : method === "reserveSale"
          ? "reservation-verified"
          : method === "cancelExpiredSale"
            ? "cancellation-verified"
            : "redemption-verified",
    evidenceKind: "live-testnet-mined",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    sourceTimestamp: afterBlock.timestamp,
    claimId: terms.claimId,
    terms,
    ...(method === "reserveSale" || method === "cancelExpiredSale"
      ? identity
      : { saleId: null, termsHash: null }),
    ...event,
    before,
    after,
    sourceFacePaidRaw: operation === "redeem" ? terms.sourceFaceValueRaw : 0n,
  });
}
