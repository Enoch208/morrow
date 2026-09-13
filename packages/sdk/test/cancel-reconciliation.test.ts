import assert from "node:assert/strict";
import test from "node:test";
import type { Claim } from "@morrow/protocol";
import { campaignTerms } from "../src/campaign-config.ts";
import { assertCancelledTransition } from "../src/cancel-reconciliation.ts";

const terms = campaignTerms("b", 3n);
const before: Claim = {
  claimId: 3n,
  sourceToken: terms.sourceToken,
  sourceFaceValueRaw: terms.sourceFaceValueRaw,
  maturity: terms.maturity,
  originalBeneficiary: terms.seller,
  currentBeneficiary: terms.seller,
  activeRound: 1n,
  latestRound: 1n,
  successfulSale: false,
  redeemed: false,
  referenceHash: `0x${"00".repeat(32)}`,
};
const after = { ...before, activeRound: 0n };

await test("T56 cancellation reconciliation requires the exact unchanged-backed terminal transition", () => {
  assert.doesNotThrow(() => {
    assertCancelledTransition(terms, before, after, 3n, 0n, 0n, 20010000000n, 20010000000n);
  });
  for (const changed of [
    { ...after, redeemed: true },
    { ...after, activeRound: 1n },
    { ...after, successfulSale: true },
    { ...after, currentBeneficiary: terms.buyer },
  ])
    assert.throws(() => {
      assertCancelledTransition(terms, before, changed, 3n, 0n, 0n, 20010000000n, 20010000000n);
    });
  assert.throws(() => {
    assertCancelledTransition(terms, before, after, 2n, 0n, 0n, 20010000000n, 20010000000n);
  });
  assert.throws(() => {
    assertCancelledTransition(terms, before, after, 3n, 0n, 1n, 20010000000n, 20010000000n);
  });
  assert.throws(() => {
    assertCancelledTransition(terms, before, after, 3n, 0n, 0n, 20010000000n, 0n);
  });
});
