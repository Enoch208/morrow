import assert from "node:assert/strict";
import test from "node:test";
import { checkC5Budget } from "../src/c5-budget.ts";

await test("C5 budget counts unresolved commitments once and never recycles mined gas ceilings", () => {
  const first = {
    action: "c5-create",
    state: "prepared",
    chainId: "11155111",
    costCeiling: "6000000000000000",
  };
  const records = [first, { ...first, state: "submitted" }, { ...first, state: "mined" }];
  assert.doesNotThrow(() => { checkC5Budget(records, "c5-r1-reserve", 11155111n, 4000000000000000n); });
  assert.throws(() => { checkC5Budget(records, "c5-r1-reserve", 11155111n, 4000000000000001n); }, /cap/);
  assert.throws(() => { checkC5Budget(records, "c5-create", 11155111n, 1n); }, /reconcile/);
  assert.throws(
    () => { checkC5Budget([{ ...first, costCeiling: "bad" }], "c5-r1-reserve", 11155111n, 1n); },
    /commitment/,
  );
  assert.throws(() => { checkC5Budget([], "c5-create", 1n, 1n); }, /chain/);
  assert.throws(
    () => { checkC5Budget([{ ...first, chainId: "102031" }], "c5-r1-reserve", 11155111n, 1n); },
    /chain/,
  );
});

await test("C5 gas caps are separate and cannot be bypassed by changing a duplicate ceiling", () => {
  const first = {
    action: "c5-r2-fund",
    state: "prepared",
    chainId: "102031",
    costCeiling: "19000000000000000",
  };
  assert.throws(() => { checkC5Budget([first], "c5-r2-settle", 102031n, 1000000000000001n); }, /cap/);
  assert.throws(
    () => { checkC5Budget(
        [first, { ...first, state: "submitted", costCeiling: "1" }],
        "c5-r2-settle",
        102031n,
        1n,
      ); },
    /conflicting/,
  );
  assert.throws(() => { checkC5Budget([], "c5-create", 11155111n, 0n); }, /cap/);
});
