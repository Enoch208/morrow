import assert from "node:assert/strict";
import { test } from "node:test";
import { staticAnalysisResult } from "./static-analysis-result.mjs";

function report(impacts = []) {
  return { success: true, results: { detectors: impacts.map((impact) => ({ impact })) } };
}

test("retains low and informational findings without claiming an audit", () => {
  assert.deepEqual(staticAnalysisResult(report(["Low", "Informational"]), 0, ""), {
    passed: true,
    exitCode: 0,
    incomplete: false,
    impacts: { Low: 1, Informational: 1 },
  });
});

for (const impact of ["High", "Medium"])
  test(`${impact} findings fail even when the analyzer returns zero`, () => {
    assert.equal(staticAnalysisResult(report([impact]), 0, "").passed, false);
  });

test("an incomplete AST cannot produce a passing check", () => {
  for (const warning of ["Failed to resolved name", "Missing inheritance", "Missing params"])
    assert.equal(staticAnalysisResult(report(), 0, warning).passed, false);
});

test("failed analysis cannot be replaced by an empty green result", () => {
  assert.equal(staticAnalysisResult(report(), 1, "").passed, false);
  assert.equal(staticAnalysisResult({ ...report(), success: false }, 0, "").passed, false);
  assert.throws(() => staticAnalysisResult({ success: true }, 0, ""), /omitted detector results/);
});

test("an unknown severity requires review", () => {
  assert.throws(
    () => staticAnalysisResult(report(["Critical"]), 0, ""),
    /Unknown static-analysis severity/,
  );
});
