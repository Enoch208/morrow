import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ConfigurationError, repositoryRoot } from "./environment.ts";

export function json(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

export async function recordCampaign(value: Record<string, unknown>): Promise<void> {
  await mkdir(`${repositoryRoot}evidence/campaign`, { recursive: true });
  const text = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${repositoryRoot}evidence/campaign/actions.jsonl`, text + "\n", {
    flush: true,
  });
  process.stdout.write(text + "\n");
}

export async function campaignRecords(): Promise<Record<string, unknown>[]> {
  const path = `${repositoryRoot}evidence/campaign/actions.jsonl`;
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new ConfigurationError("Invalid campaign record");
      return value as Record<string, unknown>;
    });
}

export async function campaignRecord(
  action: string,
  state: string,
): Promise<Record<string, unknown>> {
  const entry = (await campaignRecords()).find(
    (record) => record.action === action && record.state === state,
  );
  if (!entry) throw new ConfigurationError(`Missing campaign record ${action}/${state}`);
  return entry;
}
