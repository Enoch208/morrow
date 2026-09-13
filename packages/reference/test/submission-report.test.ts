import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceError } from "../src/checker-rpc.ts";
import {
  submissionCheck,
  submissionReport,
  SubmissionUnverified,
} from "../src/submission-report.ts";

await test("submission verdict requires every check to pass; failure outranks unavailable", async () => {
  const pass = await submissionCheck("one", "One", "historical-replay", () =>
    Promise.resolve({ detail: "verified" }),
  );
  const missing = await submissionCheck("two", "Two", "historical-replay", () =>
    Promise.reject(new SubmissionUnverified("No finality record")),
  );
  const fail = await submissionCheck("three", "Three", "live-read-verified", () =>
    Promise.reject(new EvidenceError("Wrong recipient")),
  );
  assert.equal(submissionReport([pass]).exitCode, 0);
  assert.equal(submissionReport([pass, missing]).exitCode, 2);
  assert.equal(submissionReport([missing, fail]).exitCode, 1);
  assert.equal(submissionReport([]).exitCode, 2);
  assert.match(
    submissionReport([pass]).text,
    /^MORROW — LIVE SUBMISSION VERIFICATION\nPASS \| One \| historical-replay/,
  );
  assert.match(submissionReport([pass]).text, /VERDICT: VERIFIED$/);
  assert.doesNotMatch(submissionReport([missing]).text, /VERDICT: VERIFIED/);
});

await test("submission treats outages and missing input as unverified without fake success", async () => {
  for (const code of ["ENOENT", "EPROTO", "TIMEOUT", "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC"]) {
    const error = Object.assign(new Error("unavailable"), { code });
    const row = await submissionCheck("rpc", "RPC", "live-read-verified", () =>
      Promise.reject(error),
    );
    assert.equal(row.status, "UNVERIFIED");
  }
  const row = await submissionCheck("data", "Data", "historical-replay", () =>
    Promise.reject(new SyntaxError("bad JSON")),
  );
  assert.equal(row.status, "FAIL");
});
