import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Records, recordC5 } from "./c5-log.ts";
import { loadC5Proof } from "./c5-proof.ts";
import { verifyC5Envelope } from "./c5-proof-validation.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import { c5Funding } from "./c5-funding.ts";
import { c5Assignment } from "./c5-assignment.ts";
import { c5Withdrawal } from "./c5-withdrawal.ts";
import { assertC5Accounting, c5DestinationSnapshot } from "./c5-destination-checks.ts";
import { encodeTerms } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export type C5DestinationOperation =
  "fund" | "assign" | "settle" | "refund" | "withdraw-seller" | "withdraw-fee" | "withdraw-buyer";

export async function c5Destination(
  context: C5Context,
  operation: C5DestinationOperation,
  broadcast: boolean,
): Promise<void> {
  if (operation === "fund") return c5Funding(context, broadcast);
  if (operation === "assign") return c5Assignment(context, broadcast);
  if (operation === "withdraw-seller") return c5Withdrawal(context, "seller", broadcast);
  if (operation === "withdraw-fee") return c5Withdrawal(context, "fee", broadcast);
  if (operation === "withdraw-buyer") return c5Withdrawal(context, "buyer", broadcast);
  const terms = c5Terms(await c5ClaimId(), 2n);
  const event = operation === "settle" ? "assign" : "cancel";
  const bundle = await loadC5Proof(context.source, context.destination, 2n, event);
  if (encodeTerms(bundle.terms) !== encodeTerms(terms))
    throw new ConfigurationError("C5 outcome proof terms mismatch");
  const action = `c5-r2-${operation}`;
  if (operation === "settle") {
    const refusal = (await c5Records())
      .reverse()
      .find((entry) => entry.action === "c5-refusal" && entry.state === "refusal-verified");
    if (!refusal)
      await recordC5({
        action,
        state: "cleanup-without-refusal",
        evidenceKind: "blocked",
        reason:
          "C5 refusal unavailable; approved authentic assignment cleanup proceeds without a C5 completion claim",
      });
  }
  const check = async () => {
    await verifyC5Envelope(
      context.source,
      context.destination,
      bundle.proof,
      bundle.sourceReceipt,
      terms,
      event,
    );
    const snapshot = await c5DestinationSnapshot(context.destination, terms, bundle.eventKey);
    if (snapshot.state !== 1n || snapshot.consumed)
      throw new ConfigurationError(
        "C5 outcome requires exact BOUND and unused event; reconcile first",
      );
    return snapshot;
  };
  let before = await check();
  const receipt = await submitC5(
    context,
    action,
    "PAYER",
    "market",
    operation === "settle" ? "settleAssignment" : "recognizeCancellation",
    [bundle.proof, bundle.logIndex, bundle.identity.saleId],
    broadcast,
    {
      terms,
      ...bundle.identity,
      proofPath: bundle.proofPath,
      proofHash: bundle.proofHash,
      eventKey: bundle.eventKey,
      before,
    },
    async () => {
      before = await check();
    },
  );
  if (!receipt) return;
  const after = await c5DestinationSnapshot(
    context.destination,
    terms,
    bundle.eventKey,
    receipt.blockNumber,
  );
  if (
    after.state !== (operation === "settle" ? 2n : 3n) ||
    !after.consumed ||
    after.blockHash !== receipt.blockHash
  )
    throw new ConfigurationError("C5 outcome state, consumption or canonical block mismatch");
  assertC5Accounting(before.accounting, after.accounting, terms, operation);
  await recordC5({
    action,
    state: "outcome-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    terms,
    ...bundle.identity,
    eventKey: bundle.eventKey,
    proofPath: bundle.proofPath,
    proofHash: bundle.proofHash,
    before,
    after,
  });
}
