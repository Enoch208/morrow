import type { JsonRpcProvider } from "ethers";
import { checkRelease } from "./release-check.ts";
import { releaseVerificationAttempt } from "./release-verification-attempt.ts";
import { checkedArtifact } from "./evidence-files.ts";
import { validateManifest } from "./manifest-validation.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import { submissionTimeline } from "./submission-history.ts";
import {
  checkSubmissionClaimSource,
  checkSubmissionClaimMarket,
  checkSubmissionClaimPayments,
} from "./submission-claim.ts";

export function once<T>(operation: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => (promise ??= operation());
}

export function submissionContext(
  path: string,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const releaseAttempt = once(() =>
    releaseVerificationAttempt(() => checkRelease(path, source, destination)),
  );
  const release = once(async () => {
    const attempt = await releaseAttempt();
    if (attempt.result) return attempt.result;
    const detail = attempt.failures.map((failure) => failure.detail).join("; ");
    if (attempt.failures.some((failure) => failure.kind === "data"))
      throw new EvidenceError(detail);
    throw new SubmissionUnverified(detail, attempt);
  });
  const claim = once(async () => {
    const result = await release();
    const campaign = result.campaigns.campaigns.find((item) => item.campaignId === "a");
    if (!campaign?.result) {
      if (campaign?.failures.some((failure) => failure.kind === "data"))
        throw new EvidenceError(campaign.failures.map((failure) => failure.detail).join("; "));
      throw new SubmissionUnverified("Claim A evidence verification unavailable", campaign);
    }
    if (!campaign.manifest.sha256)
      throw new SubmissionUnverified("Claim A manifest hash unavailable");
    const bytes = await checkedArtifact({
      path: campaign.manifest.path,
      sha256: campaign.manifest.sha256,
    });
    const manifest = validateManifest(JSON.parse(bytes.toString("utf8")) as unknown);
    if (manifest.campaignId !== "a")
      throw new EvidenceError("Submission selected a different claim");
    return { manifest, verified: campaign.result, timeline: await submissionTimeline(manifest) };
  });
  return {
    releaseAttempt,
    release,
    claim,
    source: once(async () => checkSubmissionClaimSource((await claim()).manifest, source)),
    market: once(async () => checkSubmissionClaimMarket((await claim()).manifest, destination)),
    payments: once(async () => {
      const value = await claim();
      return checkSubmissionClaimPayments(value.manifest, value.verified);
    }),
  };
}
