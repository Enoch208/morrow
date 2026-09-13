import assert from "node:assert/strict";
import test from "node:test";
import { checkCustodyBudget } from "../src/custody-budget.ts";

await test("custody approval allows only four matching testnet deployments", () => {
  assert.doesNotThrow(() => {
    checkCustodyBudget([], "source-token", 11155111n, 1n);
  });
  assert.throws(() => {
    checkCustodyBudget([], "fund-claim", 11155111n, 1n);
  });
  assert.throws(() => {
    checkCustodyBudget([], "market", 11155111n, 1n);
  });
  assert.throws(() => {
    checkCustodyBudget([], "source-token", 1n, 1n);
  });
});

await test("custody gas caps count pending commitments without double counting submission", () => {
  const record = { action: "source-token", chainId: "11155111", costCeiling: "10000000000000000" };
  const records = [
    { ...record, state: "prepared" },
    { ...record, state: "submitted" },
  ];
  assert.doesNotThrow(() => {
    checkCustodyBudget(records, "vault", 11155111n, 10000000000000000n);
  });
  assert.throws(() => {
    checkCustodyBudget(records, "vault", 11155111n, 10000000000000001n);
  });
  assert.throws(() => {
    checkCustodyBudget(records, "source-token", 11155111n, 1n);
  });
  assert.throws(() => {
    checkCustodyBudget([], "market", 102031n, 50000000000000001n);
  });
});
