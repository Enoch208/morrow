import { mkdir, open, stat, unlink } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { c5Directory, c5Records } from "@morrow/sdk/src/c5-log.ts";
import { assertC5Locks } from "@morrow/sdk/src/c5-locks.ts";
import { ConfigurationError, errorSummary, repositoryRoot } from "@morrow/sdk/src/environment.ts";
import { c5Plan } from "./c5.ts";
import { c5Frontier } from "./c5-frontier.ts";
import { executeC5Job, recordWorker, workerAttempts, workerLocks } from "./c5-runner.ts";
import { runC5Step } from "./c5-supervisor.ts";
import { c5Complete } from "./c5-state.ts";

const flags = process.argv.slice(2);
if (flags.length > 1 || flags.some((flag) => flag !== "--broadcast"))
  throw new ConfigurationError("C5 worker accepts only optional --broadcast");
const broadcast = flags.includes("--broadcast");
const lockPath = `${c5Directory}/worker.lock`;
let locked = false;

async function existingWorker(): Promise<void> {
  try {
    await stat(`${repositoryRoot}apps/worker/.state/campaign.lock`);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new ConfigurationError("Existing campaign operator lock requires reconciliation");
}

try {
  if (broadcast) {
    await existingWorker();
    await mkdir(c5Directory, { recursive: true });
    const handle = await open(lockPath, "wx", 0o600);
    locked = true;
    try {
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  for (;;) {
    const records = await c5Records();
    const locks = await workerLocks();
    if (broadcast) await assertC5Locks(c5Directory, records);
    const attempts = await workerAttempts();
    const unfinished = [...attempts].find(
      ([action, value]) => value.unfinished && !c5Complete(action, records),
    );
    if (unfinished)
      throw new ConfigurationError(
        `C5 unfinished subprocess requires reconciliation: ${unfinished[0]}`,
      );
    const stopped = new Set(
      [...attempts].filter(([, value]) => value.stopped).map(([action]) => action),
    );
    const plan = c5Plan(records, BigInt(Math.floor(Date.now() / 1000)), locks, stopped);
    const status = {
      action: "c5-worker",
      state: plan.state,
      evidenceKind: "proposed",
      broadcast,
      plan,
    };
    if (!broadcast) {
      process.stdout.write(
        JSON.stringify({ observedAt: new Date().toISOString(), ...status }) + "\n",
      );
      break;
    }
    await recordWorker(status);
    if (plan.state === "complete") break;
    if (plan.state === "blocked" || plan.state === "reconcile")
      throw new ConfigurationError(plan.reason);
    if (plan.state === "ready" && plan.job) {
      const job = plan.job;
      const previous = attempts.get(job.action);
      const delay = previous && previous.count > 1 ? 60000 : 30000;
      if (!previous || Date.now() - previous.lastAt >= delay) {
        const step = await runC5Step(job, records, (previous?.count ?? 0) + 1, {
          frontier: () => c5Frontier(job, records),
          execute: () => executeC5Job(job, (previous?.count ?? 0) + 1),
          records: c5Records,
          locks: workerLocks,
          record: recordWorker,
          pause: setTimeout,
        });
        if (step === "failed") await setTimeout(30000);
        continue;
      }
    }
    await setTimeout(30000);
  }
} catch (error: unknown) {
  if (broadcast)
    await recordWorker({
      action: "c5-worker",
      state: "blocked",
      evidenceKind: "blocked",
      error: errorSummary(error),
    });
  else process.stderr.write(errorSummary(error) + "\n");
  process.exitCode = 1;
} finally {
  if (locked) await unlink(lockPath);
}
