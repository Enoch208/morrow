import { checkEvidenceIntegrity } from "./evidence-integrity.mjs";

try {
  if (process.argv.length > 3) throw new Error("Expected at most one release candidate path");
  const result = await checkEvidenceIntegrity(process.argv[2]);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      status: "FAIL",
      evidenceKind: "local-tested",
      detail: error instanceof Error ? error.message : "Evidence integrity check failed",
      liveChainVerification: false,
    }) + "\n",
  );
  process.exitCode = 1;
}
