import assert from "node:assert/strict";
import test from "node:test";
import { checkSpikeSubmission } from "../src/spike-budget.ts";

await test("T56 an already-submitted action blocks duplicate sending", () => {
  assert.throws(() => {
    checkSpikeSubmission(
      [
        {
          action: "deploy-approved",
          state: "submitted",
          chainId: "11155111",
          costCeiling: "100",
        },
      ],
      "deploy-approved",
      11155111n,
      1n,
    );
  }, /already submitted/);
});

await test("Stage A total gas budget includes previous pending submissions", () => {
  assert.throws(() => {
    checkSpikeSubmission(
      [
        {
          action: "deploy-approved",
          state: "submitted",
          chainId: "11155111",
          costCeiling: "4999999999999999",
        },
      ],
      "deploy-unapproved",
      11155111n,
      2n,
    );
  }, /budget exceeded/);
  assert.doesNotThrow(() => {
    checkSpikeSubmission([], "deploy-approved", 11155111n, 100n);
  });
  assert.throws(() => {
    checkSpikeSubmission([], "deploy-approved", 1n, 100n);
  }, /Unsupported chain/);
});
