import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { ConfigurationError, repositoryRoot } from "./environment.ts";
import { compiledRuntime } from "./runtime.ts";

export async function recordCustody(value: Record<string, unknown>): Promise<void> {
  await mkdir(`${repositoryRoot}evidence/custody`, { recursive: true });
  const text = JSON.stringify(
    { observedAt: new Date().toISOString(), ...value },
    (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
  );
  await appendFile(`${repositoryRoot}evidence/custody/actions.jsonl`, text + "\n", { flush: true });
  process.stdout.write(text + "\n");
}

export async function custodyRecords(): Promise<Record<string, unknown>[]> {
  const path = `${repositoryRoot}evidence/custody/actions.jsonl`;
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new ConfigurationError("Invalid custody record");
      return value as Record<string, unknown>;
    });
}

export async function custodyAddress(action: string): Promise<string> {
  const entry = (await custodyRecords()).find(
    (record) => record.action === action && record.state === "mined",
  );
  if (!entry || typeof entry.contractAddress !== "string")
    throw new ConfigurationError(`No mined deployment: ${action}`);
  return entry.contractAddress;
}

export async function archiveCustodyArtifact(name: string): Promise<string> {
  const text = compiledRuntime(name).artifactText;
  const hash = createHash("sha256").update(text).digest("hex");
  const directory = `${repositoryRoot}deployments/custody`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${name}-${hash}.artifact.json`;
  if (!existsSync(path)) await writeFile(path, text, { flag: "wx" });
  else if ((await readFile(path, "utf8")) !== text)
    throw new ConfigurationError("Archived artifact mismatch");
  return hash;
}
