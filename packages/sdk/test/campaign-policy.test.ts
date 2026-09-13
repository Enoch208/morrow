import assert from "node:assert/strict";
import test from "node:test";
import { campaignTerms, assertLaunchWindow } from "../src/campaign-config.ts";
import { checkCampaignBudget } from "../src/campaign-budget.ts";

await test("approved campaign freezes exact quantities and wall-clock deadlines", () => {
  const a = campaignTerms("a", 2n);
  const b = campaignTerms("b", 3n);
  assert.equal(a.sourceFaceValueRaw, 10000000000n);
  assert.equal(a.grossPurchasePriceRaw, 9410000000n);
  assert.equal(a.assignBefore, 1789261200n);
  assert.equal(a.maturity, 1789272000n);
  assert.equal(b.assignBefore, 1789260300n);
  assert.equal(b.maturity, 1789264800n);
  assert.throws(() => {
    assertLaunchWindow("b", 1789254901n);
  });
  assert.doesNotThrow(() => {
    assertLaunchWindow("b", 1789254900n);
  });
});

await test("campaign gas caps aggregate every role and refuse duplicate submission", () => {
  const records = [
    {
      action: "gate-create",
      state: "prepared",
      chainId: "11155111",
      costCeiling: "10000000000000000",
    },
  ];
  assert.throws(() => {
    checkCampaignBudget(records, "a-create", 11155111n, 10000000000000001n);
  });
  assert.throws(() => {
    checkCampaignBudget(records, "gate-create", 11155111n, 1n);
  });
  assert.throws(() => {
    checkCampaignBudget([], "a-create", 1n, 1n);
  });
});
