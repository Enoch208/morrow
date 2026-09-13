import { Ajv } from "ajv";
import schema from "../../../schemas/release-candidate-v1.schema.json" with { type: "json" };
import { EvidenceError } from "./checker-rpc.ts";
import { assertPublicEvidence, safeArtifactPath } from "./evidence-files.ts";
import type { ArtifactReference } from "./manifest-types.ts";

export interface ReleaseCandidate {
  readonly schemaVersion: 1;
  readonly implementationCommit: string;
  readonly campaignManifests: readonly ArtifactReference[];
}

const validate = new Ajv({ strict: true, allErrors: true }).compile<ReleaseCandidate>(schema);

export function validateReleaseCandidate(value: unknown): ReleaseCandidate {
  assertPublicEvidence(value);
  if (!validate(value)) throw new EvidenceError("Release candidate schema rejected input");
  const paths = value.campaignManifests.map((reference) => safeArtifactPath(reference.path));
  if (new Set(paths).size !== 3) throw new EvidenceError("Release campaign paths must be distinct");
  return value;
}

export function releaseReadiness(sourceVerified: boolean, campaignGaps: readonly string[]) {
  const unverifiedGates = [
    "complete-scenario-and-mutation-evidence",
    "product-and-human-rehearsal",
    "pinned-submission-artifacts",
    "organizer-rules-and-submission-receipt",
  ];
  const sourceAndCampaignsVerified = sourceVerified && campaignGaps.length === 0;
  return {
    status: "BLOCKED" as const,
    sourceAndCampaignsVerified,
    fullReleaseVerified: false,
    scope: "Candidate source, compiler artifact consistency and live canonical campaigns",
    unverifiedGates,
    limitations: "A backend source-and-campaign check does not certify the remaining release gates",
  };
}
