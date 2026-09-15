import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SaleTerms } from "@morrow/protocol";
import { json } from "./campaign-log.ts";
import { ConfigurationError } from "./environment.ts";
import { runDirectory } from "./run-journal.ts";
import { decodeCanonicalTerms, encodeTerms } from "./canonical.ts";

export const tradeDirectory = runDirectory("trade", process.argv);

export const tradeSteps = [
  "drip-buyer",
  "approve-claim",
  "create",
  "reserve",
  "approve-fund",
  "fund-shallow-refused",
  "verify-front-run",
  "fund",
  "assign",
  "settle",
  "withdraw-seller",
  "cancel",
  "recognize",
  "withdraw-buyer",
  "redeem",
] as const;
export type TradeStep = (typeof tradeSteps)[number];

export function tradeStep(input: string | undefined): TradeStep {
  const step = tradeSteps.find((candidate) => candidate === input);
  if (!step) throw new ConfigurationError(`Choose ${tradeSteps.join(", ")}`);
  return step;
}

export async function recordTrade(value: Record<string, unknown>): Promise<void> {
  await mkdir(tradeDirectory, { recursive: true });
  const line = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${tradeDirectory}/actions.jsonl`, line + "\n", { flush: true });
  process.stdout.write(line + "\n");
}

export async function tradeRecords(): Promise<Record<string, unknown>[]> {
  const path = `${tradeDirectory}/actions.jsonl`;
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function minedTrade(
  records: readonly Record<string, unknown>[],
  step: TradeStep,
): Record<string, unknown> & { readonly transactionHash: string } {
  const row = records.find((record) => record.step === step && record.state === "mined");
  if (!row || typeof row.transactionHash !== "string")
    throw new ConfigurationError(`Step ${step} has no mined transaction yet`);
  return { ...row, transactionHash: row.transactionHash };
}

export function tradeTerms(records: readonly Record<string, unknown>[]): SaleTerms {
  const row = minedTrade(records, "reserve");
  if (typeof row.canonicalTerms !== "string")
    throw new ConfigurationError("Reservation row lacks canonical terms");
  const terms = decodeCanonicalTerms(row.canonicalTerms);
  if (encodeTerms(terms) !== row.canonicalTerms) throw new ConfigurationError("Terms mismatch");
  return terms;
}
