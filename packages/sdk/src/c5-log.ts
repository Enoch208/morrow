import { appendFile, mkdir, readFile } from "node:fs/promises";
import { repositoryRoot } from "./environment.ts";
import { ConfigurationError } from "./errors.ts";
import { json } from "./campaign-log.ts";

export const c5Directory = `${repositoryRoot}evidence/c5`;

export async function recordC5(value: Record<string, unknown>): Promise<void> {
  await mkdir(c5Directory, { recursive: true });
  const text = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${c5Directory}/actions.jsonl`, text + "\n", { flush: true });
  process.stdout.write(text + "\n");
}

export async function c5Records(): Promise<Record<string, unknown>[]> {
  let text: string;
  try {
    text = await readFile(`${c5Directory}/actions.jsonl`, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new ConfigurationError("Invalid C5 journal entry");
      return value as Record<string, unknown>;
    });
}

export async function c5Record(action: string, state: string): Promise<Record<string, unknown>> {
  const result = (await c5Records())
    .reverse()
    .find((entry) => entry.action === action && entry.state === state);
  if (!result) throw new ConfigurationError(`Missing C5 record ${action}/${state}`);
  return result;
}

export async function c5ClaimId(): Promise<bigint> {
  const entry = await c5Record("c5-create", "claim-verified");
  if (typeof entry.claimId !== "string" || !/^[1-9][0-9]*$/.test(entry.claimId))
    throw new ConfigurationError("Missing actual C5 claim ID");
  return BigInt(entry.claimId);
}
