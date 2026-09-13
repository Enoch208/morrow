import assert from "node:assert/strict";
import test from "node:test";
import { quoteEconomics } from "../src/canonical.ts";
import { referenceEconomics } from "@morrow/reference";

const boundaries: readonly [bigint, bigint][] = [
  [1n, 0n],
  [1n, 50n],
  [1n, 100n],
  [9999n, 50n],
  [10000n, 1n],
  [10000n, 50n],
  [10001n, 50n],
  [9410n, 0n],
  [9410n, 1n],
  [9410n, 50n],
  [9410n, 100n],
  [9410000000n, 50n],
];

await test("T51 floor fee matches independent reference at documented boundaries", () => {
  for (const [price, feeBps] of boundaries) {
    const sdk = quoteEconomics(price, feeBps);
    const independent = referenceEconomics(price.toString(), feeBps.toString());
    const feeRaw = (price * feeBps) / 10000n;
    assert.equal(sdk.feeRaw, feeRaw);
    assert.equal(sdk.sellerNetRaw, price - feeRaw);
    assert.equal(sdk.grossPurchasePriceRaw, price);
    assert.deepEqual(independent, {
      grossPurchasePriceRaw: price.toString(),
      feeRaw: feeRaw.toString(),
      sellerNetRaw: (price - feeRaw).toString(),
    });
  }
  assert.throws(() => quoteEconomics(0n, 50n));
  assert.throws(() => quoteEconomics(1n, 101n));
  assert.throws(() => referenceEconomics("1", "101"));
});
