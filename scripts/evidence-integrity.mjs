import { createHash } from "node:crypto";
import {
  assertPublicEvidence,
  readPublicArtifact,
  verifyArtifactBytes,
} from "../packages/reference/src/evidence-files.ts";
import {
  manifestArtifacts,
  validateManifest,
} from "../packages/reference/src/manifest-validation.ts";
import { validateReleaseCandidate } from "../packages/reference/src/release-candidate.ts";
import {
  requireCanonicalCampaign,
  requireReleaseSet,
} from "../packages/reference/src/release-campaign-policy.ts";

export async function checkEvidenceIntegrity(
  candidatePath = "evidence/release/submission.json",
  readArtifact = readPublicArtifact,
) {
  const candidateBytes = await readArtifact(candidatePath);
  const candidate = validateReleaseCandidate(JSON.parse(candidateBytes.toString("utf8")));
  const checked = new Map();
  const campaigns = [];
  const manifests = [];
  for (const reference of candidate.campaignManifests) {
    const bytes = await readArtifact(reference.path);
    verifyArtifactBytes(bytes, reference.sha256);
    const manifest = validateManifest(JSON.parse(bytes.toString("utf8")));
    requireCanonicalCampaign(manifest);
    assertPublicEvidence(manifest);
    for (const artifact of manifestArtifacts(manifest)) {
      const previousHash = checked.get(artifact.path);
      if (previousHash && previousHash !== artifact.sha256)
        throw new Error("Conflicting hashes for one evidence artifact");
      const content = await readArtifact(artifact.path);
      verifyArtifactBytes(content, artifact.sha256);
      if (artifact.path.endsWith(".json"))
        assertPublicEvidence(JSON.parse(content.toString("utf8")));
      if (artifact.path.endsWith(".jsonl"))
        for (const line of content.toString("utf8").split("\n").filter(Boolean))
          assertPublicEvidence(JSON.parse(line));
      checked.set(artifact.path, artifact.sha256);
    }
    campaigns.push(manifest.campaignId);
    manifests.push(manifest);
  }
  requireReleaseSet(manifests);
  return {
    status: "PASS",
    evidenceKind: "local-tested",
    checkedAt: new Date().toISOString(),
    candidatePath,
    candidateSha256: createHash("sha256").update(candidateBytes).digest("hex"),
    implementationCommit: candidate.implementationCommit,
    campaigns,
    artifactsChecked: checked.size,
    scope: "Offline schema, canonical identity and content integrity of pinned campaign evidence",
    liveChainVerification: false,
    limitations: [
      "No RPC calls, native proof execution, current balances or current runtime checks.",
      "Claim C is outside this three-manifest candidate and requires c5-verify.",
      "Integrity establishes consistency with the committed hashes, not an independent trust root.",
      "Historical manifests may retain null implementation commits with explicit blockers; source provenance is checked separately.",
    ],
  };
}
