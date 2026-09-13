import assert from "node:assert/strict";
import test from "node:test";
import { referenceIdentity, referenceEconomics } from "../src/index.ts";
import vector from "../../../schemas/vectors/canonical-v1.json" with { type: "json" };

await test("T61 independent canonical words match the published Solidity/SDK vector", () => {
  assert.deepEqual(referenceIdentity(vector.terms), {
    encodedTerms: vector.encodedTerms,
    claimKey: vector.claimKey,
    termsHash: vector.termsHash,
    saleId: vector.saleId,
  });
});

await test("independent economics checks limits without production outcome routines", () => {
  assert.deepEqual(referenceEconomics("9410000000", "50"), {
    grossPurchasePriceRaw: "9410000000",
    feeRaw: "47050000",
    sellerNetRaw: "9362950000",
  });
  assert.equal(referenceEconomics("1", "100").feeRaw, "0");
  assert.throws(() => referenceEconomics("1", "101"));
  assert.throws(() => referenceEconomics("-1", "50"));
  assert.throws(() => referenceIdentity({}));
});
