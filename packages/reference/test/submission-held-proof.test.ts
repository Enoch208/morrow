import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recordedAssignmentAnchor } from "../src/submission-held-proof.ts";
import { validateManifest } from "../src/manifest-validation.ts";
import { submissionTimeline } from "../src/submission-history.ts";
import { SubmissionUnverified } from "../src/submission-report.ts";

await test("held assignment selects its recorded native block even when settlement replay is later", async () => {
  const manifest = validateManifest(
    JSON.parse(
      await readFile(
        new URL("../../../evidence/manifests/a-1789279123015.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
  const rows = await submissionTimeline(manifest);
  const anchor = recordedAssignmentAnchor(manifest, rows, 5479169);
  assert.equal(anchor.height, 5477805);
  assert.equal(
    anchor.artifact.sha256,
    "9d653606bbca0583c895da30aca41ec22de6af047f800300c30a54bdf008ac84",
  );
  assert.throws(
    () => recordedAssignmentAnchor(manifest, rows, anchor.height),
    SubmissionUnverified,
  );
  assert.throws(
    () =>
      recordedAssignmentAnchor(
        manifest,
        rows.map((row) => ({ ...row, native: undefined })),
        5479169,
      ),
    SubmissionUnverified,
  );
  assert.throws(
    () =>
      recordedAssignmentAnchor(
        manifest,
        rows.map((row) => ({ ...row, proofHash: "wrong" })),
        5479169,
      ),
    SubmissionUnverified,
  );
});
