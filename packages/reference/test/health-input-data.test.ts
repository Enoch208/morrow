import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHealthProofs } from "../src/health-input-data.ts";
import { loadHealthProofs } from "../src/health-inputs.ts";

void test("browser proof input decoder reproduces the CLI inputs from public logs", async () => {
  const logs = await Promise.all(
    ["campaign", "c5"].map(async (path) => {
      const data = await readFile(
        new URL(`../../../evidence/${path}/actions.jsonl`, import.meta.url),
        "utf8",
      );
      return data
        .trim()
        .split("\n")
        .map((line): unknown => JSON.parse(line));
    }),
  );
  assert.deepEqual(parseHealthProofs(logs[0] ?? [], logs[1] ?? []), await loadHealthProofs());
});

void test("missing or malformed proof inputs never manufacture a successful case", () => {
  assert.throws(() => parseHealthProofs([], []));
  assert.throws(() => parseHealthProofs([null], []));
});
