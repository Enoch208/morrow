import { appendFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { campaignRecords } from "@morrow/sdk/src/campaign-log.ts";
import { submissionLocks } from "@morrow/sdk/src/submission-intent.ts";
import { ConfigurationError, errorSummary, repositoryRoot } from "@morrow/sdk/src/environment.ts";
import { campaignJobs, jobState } from "./campaign-jobs.ts";
import type { CampaignJob } from "./campaign-jobs.ts";

const watch = process.argv.includes("--watch");
const broadcast = process.argv.includes("--broadcast");
const directory = fileURLToPath(new URL("../.state/", import.meta.url));
const journal = `${directory}campaign.jsonl`;
const lockPath = `${directory}campaign.lock`;

async function journalEntry(action: string, state: string, attempt: number) {
  await appendFile(
    journal,
    JSON.stringify({ observedAt: new Date().toISOString(), action, state, attempt }) + "\n",
    { flush: true },
  );
}

async function attempts(): Promise<Map<string, { count: number; latest: number }>> {
  const map = new Map<string, { count: number; latest: number }>();
  if (!existsSync(journal)) return map;
  for (const line of (await readFile(journal, "utf8")).split("\n").filter(Boolean)) {
    const value: unknown = JSON.parse(line);
    if (
      typeof value !== "object" ||
      value === null ||
      !("action" in value) ||
      !("attempt" in value) ||
      !("observedAt" in value) ||
      typeof value.action !== "string" ||
      typeof value.attempt !== "number" ||
      typeof value.observedAt !== "string"
    )
      throw new ConfigurationError("Invalid worker journal; reconcile before restarting");
    const latest = Date.parse(value.observedAt);
    if (!Number.isFinite(latest) || !Number.isSafeInteger(value.attempt) || value.attempt < 1)
      throw new ConfigurationError("Invalid worker retry coordinates");
    map.set(value.action, { count: value.attempt, latest });
  }
  return map;
}

async function execute(job: CampaignJob): Promise<number | null> {
  const path = fileURLToPath(import.meta.resolve(`@morrow/sdk/src/${job.script}`));
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path, ...job.args, ...(job.signs ? ["--broadcast"] : [])],
      {
        cwd: repositoryRoot,
        stdio: "ignore",
        timeout: 180000,
      },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
}

await mkdir(directory, { recursive: true });
let locked = false;
try {
  if (watch && broadcast) {
    const lock = await open(lockPath, "wx", 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.close();
    locked = true;
  }
  let previous = "";
  let finished = false;
  do {
    const records = await campaignRecords();
    const lockedActions = await submissionLocks(`${repositoryRoot}evidence/campaign`);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const plan = campaignJobs.map((job) => ({
      action: job.action,
      state: jobState(job, records, now, lockedActions),
      notBefore: job.notBefore.toString(),
    }));
    const serialized = JSON.stringify(plan);
    if (serialized !== previous) {
      process.stdout.write(
        JSON.stringify({ observedAt: new Date().toISOString(), broadcast, plan }) + "\n",
      );
      previous = serialized;
    }
    finished = plan.every((job) => job.state === "complete");
    if (watch && broadcast && !finished) {
      if (plan.some((job) => job.state === "reconcile"))
        throw new ConfigurationError(
          "Existing transaction needs receipt/state reconciliation; no automatic resubmission",
        );
      const retry = await attempts();
      const job = campaignJobs.find((candidate) => {
        const last = retry.get(candidate.action);
        return (
          jobState(candidate, records, now, lockedActions) === "ready" &&
          (!last ||
            Date.now() - last.latest >= Math.min(300000, 15000 * 2 ** Math.min(last.count, 5)))
        );
      });
      if (job) {
        const count = (retry.get(job.action)?.count ?? 0) + 1;
        if (count > 30) throw new ConfigurationError(`Retry budget exhausted for ${job.action}`);
        await journalEntry(job.action, "started", count);
        const code = await execute(job);
        await journalEntry(
          job.action,
          code === 0 ? "command-completed" : "retryable-failure",
          count,
        );
        process.stdout.write(
          JSON.stringify({ action: job.action, exitCode: code, attempt: count }) + "\n",
        );
      }
    }
    if (watch && !finished) await setTimeout(15000);
  } while (watch && !finished);
} catch (error: unknown) {
  process.stderr.write(errorSummary(error) + "\n");
  process.exitCode = 1;
} finally {
  if (locked) await unlink(lockPath);
}
