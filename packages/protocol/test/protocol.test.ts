import assert from "node:assert/strict";
import test from "node:test";
import {
  saleTermsFields,
  destinationStates,
  sourceRoundStates,
  evidenceLabels,
  stateLanguage,
} from "../src/index.ts";

await test("T61 canonical terms retain every field in frozen order", () => {
  assert.deepEqual(
    saleTermsFields.map((field) => field.name),
    [
      "protocolVersion",
      "sourceEvmChainId",
      "sourceVault",
      "claimId",
      "round",
      "destinationEvmChainId",
      "destinationMarket",
      "seller",
      "buyer",
      "sourceToken",
      "sourceFaceValueRaw",
      "maturity",
      "settlementToken",
      "grossPurchasePriceRaw",
      "feeBps",
      "feeRecipient",
      "fundBefore",
      "assignBefore",
    ],
  );
  assert.equal(saleTermsFields.length, 18);
  assert.equal(saleTermsFields.find((field) => field.name === "feeBps")?.type, "uint16");
});

await test("T41 destination state has no timeout exit or withdrawal outcome alias", () => {
  assert.deepEqual(destinationStates, [
    "ABSENT",
    "BOUND",
    "ASSIGNED_CLAIMABLE",
    "CANCELLED_CLAIMABLE",
  ]);
  assert.deepEqual(sourceRoundStates, ["ABSENT", "RESERVED", "ASSIGNED", "CANCELLED"]);
});

await test("T58 unavailable evidence remains distinct from paid and refunded", () => {
  assert.equal(stateLanguage.EVIDENCE_UNAVAILABLE, "Evidence unavailable");
  assert.notEqual(stateLanguage.SELLER_FUNDS_CLAIMABLE, stateLanguage.SELLER_PAID);
  assert.notEqual(stateLanguage.REFUND_CLAIMABLE, stateLanguage.REFUND_WITHDRAWN);
  assert.deepEqual(evidenceLabels, [
    "proposed",
    "local-tested",
    "abstract-model",
    "fork-tested",
    "live-read-verified",
    "live-testnet-mined",
    "historical-replay",
    "user-observed",
    "blocked",
  ]);
});
