import assert from "node:assert/strict";
import test from "node:test";
import { assertC5ReadinessTimestamp } from "../src/c5-readiness-policy.ts";

await test("C5 readiness rejects invalid dates, future observations, stale initial checks and late launch", () => {
  const now = Date.parse("2026-09-13T08:15:00Z");
  assert.doesNotThrow(() => { assertC5ReadinessTimestamp("2026-09-13T08:14:00Z", now, true); });
  for (const value of ["bad", "", null, "2026-09-13T08:16:00Z", "1960-01-01T00:00:00Z"])
    assert.throws(() => { assertC5ReadinessTimestamp(value, now, true); }, /readiness/);
  assert.throws(() => { assertC5ReadinessTimestamp("2026-09-13T08:00:00Z", now, true); }, /stale/);
  assert.throws(
    () => { assertC5ReadinessTimestamp("2026-09-13T08:00:00Z", Date.parse("2026-09-13T09:01:00Z"), true); },
    /window/,
  );
  assert.doesNotThrow(() => { assertC5ReadinessTimestamp("2026-09-13T08:00:00Z", Date.parse("2026-09-13T14:00:00Z"), false); },
  );
});
