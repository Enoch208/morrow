import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseCandidate, releaseReadiness } from "../src/release-candidate.ts";

const candidate = {
  schemaVersion: 1,
  implementationCommit: "a".repeat(40),
  campaignManifests: ["gate", "a", "b"].map((id) => ({
    path: `evidence/manifests/${id}.json`,
    sha256: "b".repeat(64),
  })),
};

await test("release candidate requires immutable manifest hashes and a full commit", () => {
  assert.deepEqual(validateReleaseCandidate(candidate), candidate);
  for (const changed of [
    { ...candidate, implementationCommit: "HEAD" },
    { ...candidate, implementationCommit: "a".repeat(7) },
    { ...candidate, fullReleaseVerified: true },
    { ...candidate, campaignManifests: candidate.campaignManifests.slice(0, 2) },
    {
      ...candidate,
      campaignManifests: [...candidate.campaignManifests, candidate.campaignManifests[0]],
    },
    {
      ...candidate,
      campaignManifests: candidate.campaignManifests.map((ref) => ({ ...ref, sha256: "" })),
    },
  ])
    assert.throws(() => {
      validateReleaseCandidate(changed);
    });
});

await test("release candidate rejects duplicate paths, private paths and unexpected credentials", () => {
  assert.throws(() => {
    validateReleaseCandidate({
      ...candidate,
      campaignManifests: Array(3).fill(candidate.campaignManifests[0]),
    });
  });
  for (const path of [
    ".env",
    "../.env",
    "docs/private.json",
    "evidence/../../.env",
    "https://example.com/proof.json",
  ])
    assert.throws(() => {
      validateReleaseCandidate({
        ...candidate,
        campaignManifests: [
          { path, sha256: "b".repeat(64) },
          ...candidate.campaignManifests.slice(1),
        ],
      });
    });
  assert.throws(() => {
    validateReleaseCandidate({ ...candidate, accessToken: "must-not-persist" });
  });
});

await test("source and campaign verification never certifies unexecuted release gates", () => {
  const complete = releaseReadiness(true, []);
  assert.equal(complete.sourceAndCampaignsVerified, true);
  assert.equal(complete.fullReleaseVerified, false);
  assert.equal(complete.status, "BLOCKED");
  assert.ok(complete.unverifiedGates.includes("product-and-human-rehearsal"));
  assert.ok(complete.unverifiedGates.includes("pinned-submission-artifacts"));
  assert.equal(releaseReadiness(false, []).sourceAndCampaignsVerified, false);
  assert.equal(releaseReadiness(true, ["C5 incomplete"]).sourceAndCampaignsVerified, false);
});
