import { appendFile, mkdir, readFile, readdir, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { c5Directory } from "@morrow/sdk/src/c5-log.ts";
import { repositoryRoot } from "@morrow/sdk/src/environment.ts";
import { ConfigurationError } from "@morrow/sdk/src/errors.ts";
import type { C5Job, C5Row } from "./c5-state.ts";

export interface C5Attempt {
  count: number;
  lastAt: number;
  stopped: boolean;
  unfinished: boolean;
}
export const workerJournal = `${c5Directory}/worker.jsonl`;

export async function recordWorker(record: Record<string, unknown>) {
  await mkdir(c5Directory, { recursive: true });
  const line = JSON.stringify({ observedAt: new Date().toISOString(), ...record });
  await appendFile(workerJournal, line + "\n", { flush: true });
  process.stdout.write(line + "\n");
}

export async function workerAttempts(): Promise<Map<string, C5Attempt>> {
  let text: string;
  try {
    text = await readFile(workerJournal, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Map();
    throw error;
  }
  return parseWorkerAttempts(text);
}

export function parseWorkerAttempts(text: string): Map<string, C5Attempt> {
  const attempts = new Map<string, C5Attempt>();
  for (const line of text.split("\n").filter(Boolean)) {
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== "object" || !("state" in row))
      throw new ConfigurationError("Invalid C5 worker journal");
    if (!("attempt" in row)) continue;
    if (
      !("action" in row) ||
      !("observedAt" in row) ||
      typeof row.action !== "string" ||
      typeof row.observedAt !== "string" ||
      typeof row.attempt !== "number" ||
      !Number.isSafeInteger(row.attempt) ||
      row.attempt < 1 ||
      !Number.isFinite(Date.parse(row.observedAt))
    )
      throw new ConfigurationError("Invalid C5 worker retry record");
    attempts.set(row.action, {
      count: row.attempt,
      lastAt: Date.parse(row.observedAt),
      stopped: row.state === "semantic-stop" || row.state === "retry-budget-exhausted",
      unfinished: row.state === "started",
    });
  }
  return attempts;
}

export async function workerLocks(): Promise<ReadonlySet<string>> {
  let entries: string[];
  try {
    entries = await readdir(c5Directory);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Set();
    throw error;
  }
  if (entries.includes("operator.submission-lock"))
    throw new ConfigurationError("Another C5 operator is active or requires reconciliation");
  return new Set(
    entries
      .filter((name) => name.endsWith(".submission-lock"))
      .map((name) => name.slice(0, -".submission-lock".length)),
  );
}

export function commandFailure(
  records: readonly C5Row[],
  operation: string,
  code: number | null,
): string {
  const row = [...records]
    .reverse()
    .find((entry) => entry.action === `c5-cli-${operation}` && entry.state === "blocked");
  return typeof row?.error === "string"
    ? row.error
    : `SDK subprocess exited ${String(code)} without expected verified state`;
}

export async function executeC5Job(job: C5Job, attempt: number) {
  const script = fileURLToPath(import.meta.resolve("@morrow/sdk/src/c5-cli.ts"));
  const name = `${job.action}-${Date.now().toString()}-${attempt.toString()}`;
  const directory = `${c5Directory}/worker-commands`;
  await mkdir(directory, { recursive: true });
  const stdout = await open(`${directory}/${name}.stdout.log`, "wx", 0o600);
  const stderr = await open(`${directory}/${name}.stderr.log`, "wx", 0o600);
  const args = [script, job.operation, ...(job.signs ? ["--broadcast"] : [])];
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, args, {
          cwd: repositoryRoot,
          stdio: ["ignore", stdout.fd, stderr.fd],
          timeout: 180000,
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
          resolve({ code, signal });
        });
      },
    );
    await stdout.sync();
    await stderr.sync();
    return {
      ...result,
      command: [process.execPath, ...args],
      stdoutPath: `evidence/c5/worker-commands/${name}.stdout.log`,
      stderrPath: `evidence/c5/worker-commands/${name}.stderr.log`,
    };
  } finally {
    await stdout.close();
    await stderr.close();
  }
}
