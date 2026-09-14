import { appendFile, mkdir } from "node:fs/promises";
import { repositoryRoot } from "./environment.ts";
import { json } from "./campaign-log.ts";

export const minedRefusalDirectory = `${repositoryRoot}evidence/mined-refusals`;

export function requireMinedRefusalAction(action: string): void {
  if (!/^mined-(replay|wrong-sale|old-round|stale-proof)$/.test(action))
    throw new Error("Unsupported mined refusal action");
}

export async function recordMinedRefusal(value: Record<string, unknown>): Promise<void> {
  await mkdir(minedRefusalDirectory, { recursive: true });
  const line = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${minedRefusalDirectory}/actions.jsonl`, line + "\n", { flush: true });
  process.stdout.write(line + "\n");
}
