import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SaleTerms } from "@morrow/protocol";
import { json } from "./campaign-log.ts";
import { decodeCanonicalTerms } from "./canonical.ts";
import { ConfigurationError } from "./environment.ts";
import { runDirectory } from "./run-journal.ts";
import type { StreamStep } from "./stream-config.ts";

export function streamRunDirectory(argv: readonly string[]): string {
  return runDirectory("stream", argv);
}

export const streamDirectory = streamRunDirectory(process.argv);

export async function recordStream(value: Record<string, unknown>): Promise<void> {
  await mkdir(streamDirectory, { recursive: true });
  const line = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${streamDirectory}/actions.jsonl`, line + "\n", { flush: true });
  process.stdout.write(line + "\n");
}

export async function streamRecords(): Promise<Record<string, unknown>[]> {
  const path = `${streamDirectory}/actions.jsonl`;
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function settledStream(
  records: readonly Record<string, unknown>[],
  step: StreamStep,
): Record<string, unknown> & { readonly transactionHash: string } {
  const row = records.find(
    (record) => record.step === step && (record.state === "mined" || record.state === "refused"),
  );
  if (!row || typeof row.transactionHash !== "string")
    throw new ConfigurationError(`Step ${step} has no mined transaction yet`);
  return { ...row, transactionHash: row.transactionHash };
}

export function streamField(
  records: readonly Record<string, unknown>[],
  step: StreamStep,
  field: string,
): string {
  const value = settledStream(records, step)[field];
  if (typeof value !== "string") throw new ConfigurationError(`Step ${step} lacks ${field}`);
  return value;
}

export function streamMarketBlock(records: readonly Record<string, unknown>[]): number {
  const block = settledStream(records, "deploy-stream-market").blockNumber;
  if (typeof block !== "number") throw new ConfigurationError("Market deployment block missing");
  return block;
}

export function streamTerms(records: readonly Record<string, unknown>[]): SaleTerms {
  return decodeCanonicalTerms(streamField(records, "reserve", "canonicalTerms"));
}
