import assert from "node:assert/strict";
import test from "node:test";
import { checkC5Allowance } from "../src/c5-allowance.ts";
import { c5Times } from "../src/c5-config.ts";

const now = c5Times.launch - 600n;
const snapshot = { timestamp: now, allowance: 0n, balance: 10000000n, spenderBalance: 0n };

await test("C5 allowance signing rejects stale, skewed and post-cutoff approvals", () => {
  assert.doesNotThrow(() => {
    checkC5Allowance("approve", "source", snapshot, now);
  });
  assert.throws(() => {
    checkC5Allowance("approve", "source", { ...snapshot, timestamp: now - 121n }, now);
  }, /timestamp/);
  assert.throws(() => {
    checkC5Allowance("approve", "source", { ...snapshot, timestamp: now + 31n }, now);
  }, /timestamp/);
  assert.throws(() => {
    checkC5Allowance(
      "approve",
      "source",
      { ...snapshot, timestamp: c5Times.launch },
      c5Times.launch,
    );
  }, /window/);
  const cutoff = 1789299900n;
  assert.throws(() => {
    checkC5Allowance("approve", "settlement", { ...snapshot, timestamp: cutoff }, cutoff);
  }, /window/);
});

await test("C5 allowance signing rejects changed allowance and insufficient exact token units", () => {
  assert.throws(() => {
    checkC5Allowance("approve", "source", { ...snapshot, balance: 9999999n }, now);
  }, /balance/);
  assert.throws(() => {
    checkC5Allowance("approve", "source", { ...snapshot, allowance: 1n }, now);
  }, /Reset/);
  assert.throws(() => {
    checkC5Allowance("approve", "source", { ...snapshot, allowance: 10000000n }, now, 0n);
  }, /changed/);
  assert.doesNotThrow(() => {
    checkC5Allowance("approve", "source", { ...snapshot, allowance: 10000000n }, now);
  });
});

await test("C5 reset and revoke remain available after admission closes without new token balance", () => {
  const late = c5Times.maturity + 500n;
  for (const operation of ["reset", "revoke"] as const) {
    assert.doesNotThrow(() => {
      checkC5Allowance(
        operation,
        "source",
        { ...snapshot, allowance: 10000000n, balance: 0n, timestamp: late },
        late,
        10000000n,
      );
    });
    assert.throws(() => {
      checkC5Allowance(operation, "source", { ...snapshot, timestamp: late }, late, 10000000n);
    }, /changed/);
  }
});
