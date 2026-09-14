import { readFile } from "node:fs/promises";
import { parseHealthProofs } from "./health-input-data.ts";

async function rows(path: "campaign" | "c5"): Promise<unknown[]> {
  const data = await readFile(
    new URL(`../../../evidence/${path}/actions.jsonl`, import.meta.url),
    "utf8",
  );
  return data
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
}

export async function loadHealthProofs() {
  const [campaign, repeat] = await Promise.all([rows("campaign"), rows("c5")]);
  return parseHealthProofs(campaign, repeat);
}
