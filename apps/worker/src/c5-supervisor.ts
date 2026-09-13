import { ConfigurationError } from "@morrow/sdk/src/errors.ts";
import { errorSummary } from "@morrow/sdk/src/environment.ts";
import { c5Complete, c5Unresolved } from "./c5-state.ts";
import type { C5Job, C5Row } from "./c5-state.ts";
import { c5Retry } from "./c5-retry.ts";
import { commandFailure } from "./c5-runner.ts";

export interface C5StepPorts {
  frontier: () => Promise<(Record<string, unknown> & { ready: boolean }) | null>;
  execute: () => Promise<
    { code: number | null; signal: NodeJS.Signals | null } & Record<string, unknown>
  >;
  records: () => Promise<C5Row[]>;
  locks: () => Promise<ReadonlySet<string>>;
  record: (row: Record<string, unknown>) => Promise<void>;
  pause: (milliseconds: number) => Promise<void>;
}

export async function runC5Step(
  job: C5Job,
  before: readonly C5Row[],
  attempt: number,
  ports: C5StepPorts,
): Promise<"waiting" | "completed" | "failed"> {
  let failure: string | null = null;
  let command: Awaited<ReturnType<C5StepPorts["execute"]>> | null = null;
  try {
    const frontier = await ports.frontier();
    if (frontier && !frontier.ready) {
      await ports.record({
        action: job.action,
        state: "awaiting-attestation",
        evidenceKind: "live-read-verified",
        ...frontier,
      });
      await ports.pause(30000);
      return "waiting";
    }
    if (frontier)
      await ports.record({
        action: job.action,
        state: "attestation-observed",
        evidenceKind: "live-read-verified",
        ...frontier,
      });
    await ports.record({ action: job.action, state: "started", evidenceKind: "proposed", attempt });
    command = await ports.execute();
  } catch (error: unknown) {
    failure = errorSummary(error);
  }
  const after = await ports.records();
  const locks = await ports.locks();
  const unresolved = c5Unresolved(after, locks);
  if (unresolved)
    throw new ConfigurationError(`C5 transaction requires reconciliation: ${unresolved}`);
  if (command?.signal)
    throw new ConfigurationError(
      `C5 subprocess terminated by ${command.signal}; reconcile before restart`,
    );
  if (command?.code === 0 && c5Complete(job.action, after)) {
    await ports.record({
      action: job.action,
      state: "command-completed",
      evidenceKind: "proposed",
      attempt,
      ...command,
    });
    return "completed";
  }
  failure ??= commandFailure(after.slice(before.length), job.operation, command?.code ?? null);
  const retry = c5Retry(job, failure, attempt, BigInt(Math.floor(Date.now() / 1000)));
  await ports.record({
    action: job.action,
    state: retry.reason,
    evidenceKind: "blocked",
    attempt,
    error: failure,
    retry,
    ...(command ?? {}),
  });
  return "failed";
}
