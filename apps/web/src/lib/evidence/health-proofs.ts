import { parseHealthProofs, type HealthProofCase } from "@morrow/reference/health-proof-inputs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function rows(text: string): unknown[] {
  return text
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
}

export function loadPublicHealthProofs(): readonly HealthProofCase[] {
  try {
    const campaign = readFileSync(
      join(process.cwd(), "../../evidence/campaign/actions.jsonl"),
      "utf8",
    );
    const repeat = readFileSync(join(process.cwd(), "../../evidence/c5/actions.jsonl"), "utf8");
    return parseHealthProofs(rows(campaign), rows(repeat));
  } catch {
    return [];
  }
}
