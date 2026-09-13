import { createHash } from "node:crypto";
import type { JsonRpcProvider } from "ethers";
import { checkedArtifact, readPublicArtifact } from "./evidence-files.ts";
import { validateReleaseCandidate, releaseReadiness } from "./release-candidate.ts";
import { verifyReleaseProvenance } from "./release-provenance.ts";
import { verifyReleaseCampaigns } from "./release-campaigns.ts";
import { releaseToolIdentity, assertReleaseToolUnchanged } from "./release-tool-identity.ts";
import { EvidenceError } from "./checker-rpc.ts";

export async function checkRelease(
  path: string,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const bytes = await readPublicArtifact(path);
  const candidate = validateReleaseCandidate(JSON.parse(bytes.toString("utf8")) as unknown);
  await Promise.all(candidate.campaignManifests.map(checkedArtifact));
  const checker = await releaseToolIdentity();
  const provenance = await verifyReleaseProvenance(candidate.implementationCommit);
  const campaigns = await verifyReleaseCampaigns(
    candidate.campaignManifests.map((reference) => reference.path),
    source,
    destination,
  );
  await Promise.all(candidate.campaignManifests.map(checkedArtifact));
  const after = await releaseToolIdentity();
  assertReleaseToolUnchanged(checker, after);
  const provenanceAfter = await verifyReleaseProvenance(candidate.implementationCommit);
  const fingerprint = (value: typeof provenance) =>
    JSON.stringify([value.status, value.files, value.artifacts, value.issues]);
  if (fingerprint(provenance) !== fingerprint(provenanceAfter))
    throw new EvidenceError(
      "Candidate source or compiled artifacts changed during release verification",
    );
  if (!bytes.equals(await readPublicArtifact(path)))
    throw new EvidenceError("Release candidate changed during verification");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceKind: "live-read-verified",
    candidate: { path, sha256: createHash("sha256").update(bytes).digest("hex"), ...candidate },
    checker,
    provenance,
    campaigns,
    ...releaseReadiness(
      provenance.status === "PASS",
      campaigns.gaps.map((gap) => gap.detail),
    ),
  };
}
