import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { repositoryRoot } from "./environment.ts";

export async function recordSpike(value: Record<string, unknown>): Promise<void> {
  await mkdir(`${repositoryRoot}evidence/spike`, { recursive: true });
  const record = { observedAt: new Date().toISOString(), ...value };
  const text = JSON.stringify(record, (_, entry: unknown) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
  await appendFile(`${repositoryRoot}evidence/spike/actions.jsonl`, `${text}\n`, { flush: true });
  process.stdout.write(`${text}\n`);
}

export async function spikeRecords(): Promise<Record<string, unknown>[]> {
  const path = `${repositoryRoot}evidence/spike/actions.jsonl`;
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Invalid spike record");
      return value as Record<string, unknown>;
    });
}

export async function spikeAddress(action: string): Promise<string> {
  const lines = (await readFile(`${repositoryRoot}evidence/spike/actions.jsonl`, "utf8"))
    .trim()
    .split("\n");
  for (const line of lines.reverse()) {
    const entry: unknown = JSON.parse(line);
    if (
      typeof entry === "object" &&
      entry !== null &&
      "action" in entry &&
      entry.action === action &&
      "state" in entry &&
      entry.state === "mined" &&
      "contractAddress" in entry &&
      typeof entry.contractAddress === "string"
    )
      return entry.contractAddress;
  }
  throw new Error(`No mined deployment for ${action}`);
}
