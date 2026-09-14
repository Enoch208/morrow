import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ConfigurationError, repositoryRoot } from "./environment.ts";

export const faucetDirectory = `${repositoryRoot}evidence/faucet`;

export async function recordFaucet(value: Record<string, unknown>): Promise<void> {
  await mkdir(faucetDirectory, { recursive: true });
  const text = JSON.stringify(
    { observedAt: new Date().toISOString(), ...value },
    (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
  );
  await appendFile(`${faucetDirectory}/actions.jsonl`, text + "\n", { flush: true });
  process.stdout.write(text + "\n");
}

export async function faucetRecords(): Promise<Record<string, unknown>[]> {
  const path = `${faucetDirectory}/actions.jsonl`;
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new ConfigurationError("Invalid faucet record");
      return value as Record<string, unknown>;
    });
}

export function minedFaucetAddress(records: readonly Record<string, unknown>[], action: string) {
  const entry = records.find((record) => record.action === action && record.state === "mined");
  if (!entry || typeof entry.contractAddress !== "string")
    throw new ConfigurationError(`No mined faucet deployment: ${action}`);
  return entry.contractAddress;
}
