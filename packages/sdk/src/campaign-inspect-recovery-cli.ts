import { mkdir, readFile, writeFile } from "node:fs/promises";
import { campaignRecords, json } from "./campaign-log.ts";
import { requireCampaignAction } from "./submission-intent.ts";
import { inspectRecovery, recoveryIntent } from "./transaction-recovery.ts";
import {
  ConfigurationError,
  cc3Rpc,
  errorSummary,
  provider,
  repositoryRoot,
} from "./environment.ts";

async function main() {
  const action = process.argv[2];
  if (!action)
    throw new ConfigurationError("Provide one campaign action to inspect without signing");
  requireCampaignAction(action);
  const candidates = (await campaignRecords()).filter(
    (entry) =>
      entry.action === action &&
      (entry.state === "prepared" || entry.state === "submitted") &&
      typeof entry.transactionHash === "string",
  );
  try {
    const text = await readFile(
      `${repositoryRoot}evidence/campaign/${action}.submission-lock`,
      "utf8",
    );
    if (text.trim()) {
      const value: unknown = JSON.parse(text);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new ConfigurationError("Recovery lock is malformed");
      candidates.push(value as Record<string, unknown>);
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const intents = candidates.map(recoveryIntent);
  const intent = intents[0];
  if (intent?.action !== action || intents.some((candidate) => json(candidate) !== json(intent)))
    throw new ConfigurationError(
      "Recovery intent missing or conflicting; do not clear locks or resend",
    );
  const rpc = provider(
    intent.chainId === "11155111" ? "https://ethereum-sepolia-rpc.publicnode.com" : cc3Rpc,
  );
  try {
    const result = await inspectRecovery(rpc, intent);
    const path = `evidence/recovery/${action}-${Date.now().toString()}.json`;
    await mkdir(`${repositoryRoot}evidence/recovery`, { recursive: true });
    await writeFile(
      `${repositoryRoot}${path}`,
      json({
        observedAt: new Date().toISOString(),
        evidenceKind: "live-read-verified",
        ...result,
      }) + "\n",
      { flag: "wx" },
    );
    process.stdout.write(
      json({
        path,
        action,
        state: result.state,
        receiptFinalized: result.receiptFinalized,
        signingEnabled: false,
        resubmissionAllowed: false,
      }) + "\n",
    );
  } finally {
    rpc.destroy();
  }
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(errorSummary(error) + "\n");
  process.exitCode = 1;
}
