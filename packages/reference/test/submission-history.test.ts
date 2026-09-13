import assert from "node:assert/strict";
import test from "node:test";
import { assertRefusalBytes } from "../src/submission-refusal.ts";
import {
  assertFinalityOrdering,
  assertFundingFinalized,
  historyRow,
} from "../src/submission-history.ts";
import { SubmissionUnverified } from "../src/submission-report.ts";
import { assertLateCheckpoint } from "../src/submission-late-cancel.ts";

await test("submission refusal requires exact observed revert rather than a recorded label", () => {
  assert.doesNotThrow(() => {
    assertRefusalBytes("0x1234", "0x1234", "0x1234");
  });
  for (const actual of [null, "0x", "0x5678"])
    assert.throws(() => {
      assertRefusalBytes(actual, "0x1234", "0x1234");
    }, /Refusal/);
  assert.throws(() => {
    assertRefusalBytes("0x1234", "0x5678", "0x1234");
  }, /Refusal/);
});

await test("late cancellation requires both canonical chain checkpoints after maturity", () => {
  const terms = { assignBefore: "100", maturity: "200" };
  assert.doesNotThrow(() => {
    assertLateCheckpoint(terms, 300, 299, 300, 299);
  });
  for (const pair of [
    [300, 150],
    [150, 300],
    [300, 200],
    [200, 300],
  ] as const) {
    const [source, destination] = pair;
    assert.throws(() => {
      assertLateCheckpoint(terms, source, destination, source, destination);
    });
  }
  assert.throws(() => {
    assertLateCheckpoint(terms, 300, 299, 301, 299);
  }, /timestamp/);
});

await test("submission requires funding ordered before assignment and under the finalized head", () => {
  assert.doesNotThrow(() => {
    assertFinalityOrdering(10, 11);
  });
  assert.throws(() => {
    assertFinalityOrdering(11, 11);
  }, /timestamp/);
  assert.throws(() => {
    assertFinalityOrdering(12, 11);
  }, /timestamp/);
  assert.doesNotThrow(() => {
    assertFundingFinalized(20, 20);
  });
  assert.throws(() => {
    assertFundingFinalized(19, 20);
  }, SubmissionUnverified);
  assert.throws(() => {
    assertFundingFinalized(undefined, 20);
  }, SubmissionUnverified);
  assert.throws(() => historyRow([], "a-assign", "preflight-passed"), SubmissionUnverified);
});
