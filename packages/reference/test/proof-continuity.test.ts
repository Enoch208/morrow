import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareProofContinuity } from "../src/proof-continuity.ts";
import { record } from "../src/evidence-files.ts";

const archived = record(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../evidence/campaign/a-assign-1789254577056-152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as unknown,
);

await test("Continuity comparison never permits changed authenticated source components", () => {
  assert.equal(compareProofContinuity(archived, archived).continuityChanged, false);
  for (const field of ["chainKey", "headerNumber", "txHash", "txBytes", "merkleProof"])
    assert.throws(() => compareProofContinuity(archived, { ...archived, [field]: null }));
  assert.throws(() => compareProofContinuity({}, {}));
});

await test("Continuity comparison is not native verification or automatic delivery permission", () => {
  const comparison = compareProofContinuity(archived, {
    ...archived,
    continuityProof: { ...record(archived.continuityProof), roots: [] },
  });
  assert.equal(comparison.authenticatedComponentsUnchanged, true);
  assert.equal(comparison.continuityChanged, true);
  assert.equal(comparison.refreshedRootCount, 0);
});
