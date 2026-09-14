import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { readPublicArtifact } from "../packages/reference/src/evidence-files.ts";
import { checkEvidenceIntegrity } from "./evidence-integrity.mjs";
import { referenceIdentity } from "../packages/reference/src/index.ts";

const candidatePath = "evidence/release/submission.json";
const candidate = JSON.parse((await readPublicArtifact(candidatePath)).toString("utf8"));
const firstReference = candidate.campaignManifests[0];
const firstManifest = JSON.parse((await readPublicArtifact(firstReference.path)).toString("utf8"));

function readerWith(overrides) {
  return async (path) => overrides.get(path) ?? (await readPublicArtifact(path));
}

function modifiedManifest(change) {
  const manifest = structuredClone(firstManifest);
  change(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  const release = structuredClone(candidate);
  release.campaignManifests[0].sha256 = createHash("sha256").update(bytes).digest("hex");
  return readerWith(
    new Map([
      [candidatePath, Buffer.from(JSON.stringify(release))],
      [firstReference.path, bytes],
    ]),
  );
}

test("checks actual pinned manifests without claiming live verification", async () => {
  const result = await checkEvidenceIntegrity();
  assert.equal(result.status, "PASS");
  assert.equal(result.liveChainVerification, false);
  assert.equal(result.evidenceKind, "local-tested");
  assert.deepEqual(result.campaigns.slice().sort(), ["a", "b", "gate"]);
  assert.ok(result.artifactsChecked > 0);
});

test("rejects mutated manifest bytes before trusting its contents", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      readerWith(new Map([[firstReference.path, Buffer.from("{}")]])),
    ),
    /content hash mismatch/,
  );
});

test("rejects changed artifact bytes", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      readerWith(new Map([[firstManifest.timeline.path, Buffer.from("{}")]])),
    ),
    /content hash mismatch/,
  );
});

test("independently rejects changed economics even when manifest hash is recomputed", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      modifiedManifest((manifest) => {
        manifest.terms.grossPurchasePriceRaw = (
          BigInt(manifest.terms.grossPurchasePriceRaw) + 1n
        ).toString();
      }),
    ),
    /canonical identity mismatch/,
  );
});

test("rejects a fabricated commit with an inconsistent unknown-commit disclosure", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      modifiedManifest((manifest) => {
        manifest.implementationCommit = "0".repeat(40);
      }),
    ),
    /Unknown implementation commit needs an explicit blocker/,
  );
});

test("rejects evidence paths outside the public boundary", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      modifiedManifest((manifest) => {
        manifest.timeline.path = "evidence/../.env";
      }),
    ),
  );
});

test("rejects missing artifacts instead of skipping them", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(candidatePath, async (path) => {
      if (path === firstManifest.timeline.path) throw new Error("Artifact unavailable");
      return readPublicArtifact(path);
    }),
    /Artifact unavailable/,
  );
});

test("rejects a self-consistent substitute claim with recomputed hashes", async () => {
  await assert.rejects(
    checkEvidenceIntegrity(
      candidatePath,
      modifiedManifest((manifest) => {
        manifest.terms.claimId = "999";
        manifest.identity = referenceIdentity(manifest.terms);
        for (const proof of manifest.proofs) {
          proof.decodedEvent.claimId = manifest.terms.claimId;
          proof.decodedEvent.saleId = manifest.identity.saleId;
          proof.decodedEvent.termsHash = manifest.identity.termsHash;
        }
      }),
    ),
    /not its canonical gate\/A\/B sale/,
  );
});
