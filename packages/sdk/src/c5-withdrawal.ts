import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Record, recordC5 } from "./c5-log.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import { quoteEconomics } from "./canonical.ts";
import { assertC5Withdrawal, c5DestinationSnapshot } from "./c5-destination-checks.ts";
import { ConfigurationError } from "./errors.ts";

export async function c5Withdrawal(
  context: C5Context,
  recipient: "seller" | "fee" | "buyer",
  broadcast: boolean,
): Promise<void> {
  const terms = c5Terms(await c5ClaimId(), 2n);
  const operation = recipient === "buyer" ? "refund" : "settle";
  const outcome = await c5Record(`c5-r2-${operation}`, "outcome-verified");
  if (typeof outcome.eventKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(outcome.eventKey))
    throw new ConfigurationError("C5 outcome event identity unavailable");
  const eventKey = outcome.eventKey;
  const role = recipient === "seller" ? "SELLER" : recipient === "fee" ? "PAYER" : "BUYER";
  const creditKey =
    recipient === "seller" ? "sellerCredit" : recipient === "fee" ? "payerCredit" : "buyerCredit";
  const economics = quoteEconomics(terms.grossPurchasePriceRaw, terms.feeBps);
  const expected =
    recipient === "seller"
      ? economics.sellerNetRaw
      : recipient === "fee"
        ? economics.feeRaw
        : terms.grossPurchasePriceRaw;
  const check = async () => {
    const snapshot = await c5DestinationSnapshot(context.destination, terms, eventKey);
    if (
      snapshot.state !== (operation === "settle" ? 2n : 3n) ||
      !snapshot.consumed ||
      snapshot.accounting[creditKey] !== expected
    )
      throw new ConfigurationError("C5 withdrawal exact entitlement unavailable; reconcile first");
    return snapshot;
  };
  let before = await check();
  const action = `c5-withdraw-${recipient}`;
  const receipt = await submitC5(
    context,
    action,
    role,
    "market",
    "withdraw",
    [],
    broadcast,
    { terms, role, amount: expected, before },
    async () => {
      before = await check();
    },
  );
  if (!receipt) return;
  const after = await c5DestinationSnapshot(
    context.destination,
    terms,
    eventKey,
    receipt.blockNumber,
  );
  assertC5Withdrawal(before.accounting, after.accounting, recipient, expected);
  if (
    after.state !== before.state ||
    after.consumed !== before.consumed ||
    after.blockHash !== receipt.blockHash
  )
    throw new ConfigurationError("C5 withdrawal changed outcome or canonical block");
  await recordC5({
    action,
    state: "withdrawal-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    role,
    amount: expected,
    eventKey,
    before,
    after,
  });
}
