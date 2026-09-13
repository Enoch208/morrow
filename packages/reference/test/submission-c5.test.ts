import assert from "node:assert/strict";
import test from "node:test";
import { submissionC5Observation } from "../src/submission-c5.ts";
import { SubmissionUnverified } from "../src/submission-report.ts";
import { EvidenceError } from "../src/checker-rpc.ts";

await test("submission C5 distinguishes missing completion from contradictory evidence", () => {
  assert.throws(
    () =>
      submissionC5Observation(
        { result: null, failures: [{ kind: "transport", detail: "EPROTO" }] },
        "c5-redeem",
      ),
    SubmissionUnverified,
  );
  assert.throws(
    () =>
      submissionC5Observation(
        { result: null, failures: [{ kind: "data", detail: "Wrong receipt" }] },
        "c5-redeem",
      ),
    EvidenceError,
  );
  assert.throws(
    () =>
      submissionC5Observation(
        {
          result: { c5Verified: false, missing: ["c5-redeem"], verified: ["c5-r2-fund"] },
          failures: [],
        },
        "c5-r2-fund",
      ),
    SubmissionUnverified,
  );
  assert.throws(
    () =>
      submissionC5Observation(
        { result: { c5Verified: true, missing: [], verified: [] }, failures: [] },
        "c5-redeem",
      ),
    EvidenceError,
  );
  assert.equal(
    submissionC5Observation(
      { result: { c5Verified: true, missing: [], verified: ["c5-redeem"] }, failures: [] },
      "c5-redeem",
    ).detail,
    "c5-verify passed the complete campaign",
  );
});
