import assert from "node:assert/strict";
import test from "node:test";
import { campaignJobs, jobState } from "../src/campaign-jobs.ts";

const cancel = campaignJobs.find((job) => job.action === "b-cancel");
assert.ok(cancel);
const funded = [{ action: "b-fund", state: "bound-verified" }];

await test("campaign job does not run before dependency or approved deadline", () => {
  assert.equal(jobState(cancel, [], 1789260300n), "waiting");
  assert.equal(jobState(cancel, funded, 1789260299n), "waiting");
  assert.equal(jobState(cancel, funded, 1789260300n), "ready");
});

await test("restart never blindly rebroadcasts prepared, submitted, mined or reverted work", () => {
  for (const state of ["prepared", "submitted", "mined", "reverted"]) {
    assert.equal(
      jobState(cancel, [...funded, { action: "b-cancel", state }], 1789260300n),
      "reconcile",
    );
  }
  assert.equal(
    jobState(
      cancel,
      [...funded, { action: "b-cancel", state: "cancellation-verified" }],
      1789260300n,
    ),
    "complete",
  );
});

await test("late settlement requires archived proof and verified redemption, not just time", () => {
  const settle = campaignJobs.find((job) => job.action === "a-settle");
  assert.ok(settle);
  assert.equal(jobState(settle, [], 1789272000n), "waiting");
  const dependencies = [
    { action: "a-redeem", state: "redemption-verified" },
    { action: "a-assign-archive", state: "archived" },
  ];
  assert.equal(jobState(settle, dependencies, 1789271999n), "waiting");
  assert.equal(jobState(settle, dependencies, 1789272000n), "ready");
});

await test("T56 an orphan submission lock blocks retries even without a journal entry", () => {
  assert.equal(jobState(cancel, funded, 1789260300n, new Set(["b-cancel"])), "reconcile");
  assert.equal(jobState(cancel, funded, 1789260300n, new Set(["a-settle"])), "ready");
  assert.equal(
    jobState(
      cancel,
      [...funded, { action: "b-cancel", state: "cancellation-verified" }],
      1789260300n,
      new Set(["b-cancel"]),
    ),
    "complete",
  );
});
