import { loadHealthProofs } from "./health-inputs.ts";
import { verifyHealth } from "./health-report.ts";
import { storeEvidence } from "./evidence-files.ts";

const result = await verifyHealth(await loadHealthProofs());
const artifact = await storeEvidence(result);
process.stdout.write("MORROW — LIVE HEALTH\n");
for (const check of result.checks)
  process.stdout.write(
    `${check.status} | ${check.name} | ${check.evidenceKind} | ${check.detail}\n`,
  );
process.stdout.write(`VERDICT: ${result.verdict}\nEvidence: ${artifact.path}\n${result.scope}\n`);
process.exitCode = result.verdict === "FAIL" ? 1 : result.verdict === "UNVERIFIED" ? 2 : 0;
