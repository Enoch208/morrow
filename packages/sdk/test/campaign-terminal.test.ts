import assert from "node:assert/strict";
import test from "node:test";
import { campaignTerms } from "../src/campaign-config.ts";
import { assertTerminalTiming } from "../src/campaign-terminal-policy.ts";

await test("campaign cancellation respects exact source deadline and never cancels A", () => {
  const b = campaignTerms("b", 3n);
  assert.throws(() => { assertTerminalTiming("b", "cancel", b.assignBefore - 1n, false); });
  assert.doesNotThrow(() => { assertTerminalTiming("b", "cancel", b.assignBefore, false); });
  assert.throws(() => { assertTerminalTiming("a", "cancel", b.maturity, false); });
});

await test("A proof remains held until maturity and independently verified redemption", () => {
  const a = campaignTerms("a", 2n);
  assert.throws(() => { assertTerminalTiming("a", "settle", a.maturity - 1n, true); });
  assert.throws(() => { assertTerminalTiming("a", "settle", a.maturity, false); });
  assert.doesNotThrow(() => { assertTerminalTiming("a", "settle", a.maturity, true); });
  assert.throws(() => { assertTerminalTiming("b", "settle", a.maturity, true); });
});

await test("redemption never anticipates the approved maturity", () => {
  for (const name of ["gate", "a", "b"] as const) {
    const terms = campaignTerms(name, 1n);
    assert.throws(() => { assertTerminalTiming(name, "redeem", terms.maturity - 1n, false); });
    assert.doesNotThrow(() => { assertTerminalTiming(name, "redeem", terms.maturity, false); });
  }
});
