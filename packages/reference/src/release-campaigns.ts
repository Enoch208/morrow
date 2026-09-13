import { createHash } from "node:crypto";
import type { JsonRpcProvider } from "ethers";
import { readPublicArtifact, checkedArtifact, assertPublicEvidence } from "./evidence-files.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { validateManifest } from "./manifest-validation.ts";
import { verifyManifest } from "./manifest-verify.ts";
import { verifyC5 } from "./c5-verify.ts";
import { requireCanonicalCampaign, requireReleaseSet } from "./release-campaign-policy.ts";
import { releaseCampaignTiming } from "./release-campaign-timing.ts";
import { releaseFailure, releaseVerificationAttempt } from "./release-verification-attempt.ts";

export async function verifyReleaseCampaigns(
  manifestPaths: readonly string[],
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  if (manifestPaths.length !== 3 || new Set(manifestPaths).size !== 3)
    throw new EvidenceError(
      "Release evidence requires exactly three distinct public manifest paths",
    );
  const loaded = await Promise.all(
    manifestPaths.map(async (path) => ({
      path,
      ...(await releaseVerificationAttempt(async () => {
        const bytes = await readPublicArtifact(path);
        const manifest = validateManifest(JSON.parse(bytes.toString("utf8")) as unknown);
        requireCanonicalCampaign(manifest);
        return {
          manifest,
          artifact: { path, sha256: createHash("sha256").update(bytes).digest("hex") },
        };
      })),
    })),
  );
  const gaps: {
    campaignId: string | null;
    kind: "transport" | "data" | "dependency" | "incomplete";
    detail: string;
  }[] = [];
  const valid = loaded.flatMap((item) => (item.result ? [item.result.manifest] : []));
  try {
    requireReleaseSet(valid);
  } catch (error: unknown) {
    const failure = releaseFailure(error, 1);
    gaps.push({ campaignId: null, kind: failure.kind, detail: failure.detail });
  }
  const campaigns = [];
  const completed = new Set<string>();
  for (const item of loaded) {
    if (!item.result) {
      campaigns.push({
        campaignId: null,
        manifest: { path: item.path, sha256: null },
        status: item.status,
        result: null,
        terminalChecks: null,
        attempts: item.attempts,
        failures: item.failures,
      });
      gaps.push(
        ...item.failures.map((failure) => ({
          campaignId: null,
          kind: failure.kind,
          detail: failure.detail,
        })),
      );
      continue;
    }
    const { manifest, artifact } = item.result;
    const attempt = await releaseVerificationAttempt(async () => {
      await checkedArtifact(artifact);
      const result = await verifyManifest(manifest, source, destination);
      const terminalChecks = await releaseCampaignTiming(manifest, source, destination);
      await checkedArtifact(artifact);
      return { result, terminalChecks };
    });
    campaigns.push({
      campaignId: manifest.campaignId,
      manifest: artifact,
      status: attempt.status,
      result: attempt.result?.result ?? null,
      terminalChecks: attempt.result?.terminalChecks ?? null,
      attempts: attempt.attempts,
      failures: [...item.failures, ...attempt.failures],
    });
    if (attempt.result) completed.add(manifest.campaignId);
    else
      gaps.push(
        ...attempt.failures.map((failure) => ({
          campaignId: manifest.campaignId,
          kind: failure.kind,
          detail: failure.detail,
        })),
      );
  }
  const c5 = await releaseVerificationAttempt(() => verifyC5(source, destination));
  if (!c5.result)
    gaps.push(
      ...c5.failures.map((failure) => ({
        campaignId: "c5",
        kind: failure.kind,
        detail: failure.detail,
      })),
    );
  else {
    if (c5.result.c5Verified) completed.add("c5");
    gaps.push(
      ...c5.result.missing.map((stage) => ({
        campaignId: "c5",
        kind: "incomplete" as const,
        detail: `Missing independently verified ${stage}`,
      })),
    );
    gaps.push(
      ...c5.result.pending.map((intent) => ({
        campaignId: "c5",
        kind: "incomplete" as const,
        detail: `Unreconciled ${intent.action} transaction ${intent.transactionHash}`,
      })),
    );
  }
  const result = {
    generatedAt: new Date().toISOString(),
    evidenceKind: "historical-replay",
    campaigns,
    c5,
    completed: [...completed],
    gaps,
    fullReleaseVerified: false,
    scope:
      "Fresh keyless canonical gate/A/B campaign checks and incremental C5 evidence; not complete release verification",
  };
  assertPublicEvidence(result);
  return result;
}
