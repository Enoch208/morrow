import assert from "node:assert/strict";
import test from "node:test";
import { c5Job } from "../src/c5-state.ts";
import { c5Retry } from "../src/c5-retry.ts";
import { runC5Step } from "../src/c5-supervisor.ts";
import type { C5StepPorts } from "../src/c5-supervisor.ts";
import type { C5Row } from "../src/c5-state.ts";
import { parseWorkerAttempts } from "../src/c5-runner.ts";

function fixture() {
  const journal: Record<string, unknown>[] = [];
  const records: C5Row[] = [];
  let executions = 0;
  const pauses: number[] = [];
  const ports: C5StepPorts = {
    frontier: () => Promise.resolve(null),
    execute: () => {
      executions++;
      return Promise.resolve({ code: 1, signal: null });
    },
    records: () => Promise.resolve(records),
    locks: () => Promise.resolve(new Set()),
    record: (row) => {
      journal.push(row);
      return Promise.resolve();
    },
    pause: (milliseconds) => {
      pauses.push(milliseconds);
      return Promise.resolve();
    },
  };
  return { ports, journal, records, pauses, executions: () => executions };
}

await test("C5 native attestation wait executes no SDK command or retry attempt", async () => {
  const f = fixture();
  f.ports.frontier = () => Promise.resolve({ ready: false, nativeHeight: "9", sourceBlock: 10 });
  assert.equal(await runC5Step(c5Job("proof-r1-reserve"), [], 1, f.ports), "waiting");
  assert.equal(f.executions(), 0);
  assert.equal(f.journal.length, 1);
  assert.equal(f.journal[0]?.state, "awaiting-attestation");
  assert.equal(f.journal[0].attempt, undefined);
  assert.deepEqual(f.pauses, [30000]);
});

await test("C5 old retryable error cannot explain a later unknown command exit", async () => {
  const f = fixture();
  f.records.push({
    action: "c5-cli-assign",
    state: "blocked",
    error: "Funding transaction is unfinalized",
  });
  const before = [...f.records];
  assert.equal(await runC5Step(c5Job("assign"), before, 1, f.ports), "failed");
  assert.equal(f.journal.at(-1)?.state, "semantic-stop");
  assert.match(String(f.journal.at(-1)?.error), /without expected verified state/);
});

await test("C5 ambiguous broadcasts and killed commands require reconciliation without retry", async () => {
  const f = fixture();
  f.ports.execute = () => {
    f.records.push({
      action: "c5-r2-fund",
      state: "prepared",
      transactionHash: `0x${"ab".repeat(32)}`,
    });
    return Promise.resolve({ code: 1, signal: null });
  };
  await assert.rejects(runC5Step(c5Job("fund"), [], 1, f.ports), /reconciliation/);
  assert.equal(f.journal.filter((row) => row.state === "retryable-dependency").length, 0);
  const killed = fixture();
  killed.ports.execute = () => Promise.resolve({ code: null, signal: "SIGTERM" });
  await assert.rejects(runC5Step(c5Job("proof-r2-assign"), [], 1, killed.ports), /terminated/);
});

await test("C5 retries only exact finality and chain-boundary failures within bounded budgets", () => {
  assert.equal(
    c5Retry(c5Job("assign"), "Funding transaction is unfinalized", 1, 1789301600n).retry,
    true,
  );
  assert.equal(
    c5Retry(c5Job("assign"), "Funding transaction is unfinalized", 20, 1789301600n).retry,
    false,
  );
  assert.equal(
    c5Retry(c5Job("assign"), "Funding transaction is unfinalized", 1, 1789301700n).retry,
    false,
  );
  assert.equal(
    c5Retry(
      c5Job("assign"),
      "Funding transaction is missing, reverted, unfinalized or mismatched",
      1,
      1789301600n,
    ).retry,
    false,
  );
  assert.equal(
    c5Retry(c5Job("refusal"), "C5 refusal source assignment is unfinalized", 1, 1789306000n).retry,
    true,
  );
  assert.equal(
    c5Retry(c5Job("refusal"), "C5 refusal source assignment is unfinalized", 1, 1789306200n).retry,
    false,
  );
  for (const operation of ["cancel1", "cancel2", "redeem"]) {
    const message =
      operation === "redeem"
        ? "C5 source redemption too early"
        : "C5 source cancellation too early";
    assert.equal(c5Retry(c5Job(operation), message, 1, 1789306200n).retry, true);
    assert.equal(c5Retry(c5Job(operation), message, 4, 1789306200n).retry, false);
    assert.equal(
      c5Retry(c5Job(operation), "C5 source clock stale or skewed", 1, 1789306200n).retry,
      false,
    );
  }
});

await test("C5 proof service 404 retries are bounded and do not mask native semantic refusal", () => {
  const message =
    "Failed to generate proof via API: Error: Failed to fetch proof: AxiosError: Request failed with status code 404";
  assert.equal(c5Retry(c5Job("proof-r1-cancel"), message, 1, 1789297000n).retry, true);
  assert.equal(c5Retry(c5Job("proof-r1-cancel"), message, 12, 1789297000n).retry, false);
  assert.equal(c5Retry(c5Job("fund"), message, 1, 1789297000n).retry, false);
  assert.equal(
    c5Retry(c5Job("proof-r1-cancel"), "Native proof verification failed", 1, 1789297000n).retry,
    false,
  );
});

await test("C5 interrupted worker attempt remains unresolved until a terminal command record", () => {
  const started = {
    action: "c5-r2-fund",
    state: "started",
    attempt: 1,
    observedAt: "2026-09-13T11:00:00Z",
  };
  assert.equal(parseWorkerAttempts(JSON.stringify(started)).get(started.action)?.unfinished, true);
  const finished = { ...started, state: "command-completed" };
  assert.equal(
    parseWorkerAttempts([started, finished].map((row) => JSON.stringify(row)).join("\n")).get(
      started.action,
    )?.unfinished,
    false,
  );
});
