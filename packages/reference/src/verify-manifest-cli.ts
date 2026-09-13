import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readPublicArtifact } from "./evidence-files.ts";
import { EvidenceError, root, rpcPair } from "./checker-rpc.ts";
import { verifyManifest } from "./manifest-verify.ts";
import { verificationWithRetry } from "./verification-retry.ts";

const path = process.argv[2];
if (!path) throw new EvidenceError("Provide a public campaign manifest path");
const { source, destination } = rpcPair();
try {
  const bytes = await readPublicArtifact(path);
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  const verified = await verificationWithRetry(() => verifyManifest(value, source, destination));
  const result = verified.result;
  const report = {
    generatedAt: new Date().toISOString(),
    evidenceKind: "live-read-verified",
    manifestPath: path,
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    attempts: verified.attempts,
    transientFailures: verified.transientFailures,
    ...result,
  };
  await mkdir(`${root}evidence/independent`, { recursive: true });
  const reportPath = `evidence/independent/manifest-${result.campaignId}-${Date.now().toString()}.json`;
  await writeFile(
    `${root}${reportPath}`,
    JSON.stringify(
      report,
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      reportPath,
      campaignId: result.campaignId,
      artifactsChecked: result.artifactsChecked,
      transactionsChecked: result.transactionsChecked,
      paymentChecks: result.paymentChecks.length,
      marketTransitionsChecked: result.marketTransitionChecks.length,
      sourceTransitionsChecked: result.sourceTransitionChecks.length,
      nativeProofsChecked: result.nativeProofsChecked,
      snapshotsChecked: result.snapshotsChecked,
      fullReleaseVerified: result.fullReleaseVerified,
    }) + "\n",
  );
} catch (error: unknown) {
  process.stderr.write(
    "UNVERIFIABLE: " +
      (error instanceof EvidenceError
        ? error.message
        : "Manifest verification failed; dependency or data unavailable") +
      "\n",
  );
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
