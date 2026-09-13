import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceError } from "../src/checker-rpc.ts";
import { TransientEvidenceError, verificationWithRetry } from "../src/verification-retry.ts";

await test("a transient transport failure can recover without hiding the failed attempt", async () => {
  let calls = 0;
  const checked = await verificationWithRetry(() => {
    calls++;
    return calls === 1
      ? Promise.reject(new TransientEvidenceError("public RPC unavailable"))
      : Promise.resolve("verified");
  });
  assert.equal(checked.result, "verified");
  assert.equal(checked.attempts, 2);
  assert.deepEqual(checked.transientFailures, ["public RPC unavailable"]);
});

await test("proof/data rejection is terminal and cannot be retried into success", async () => {
  let calls = 0;
  await assert.rejects(
    verificationWithRetry(() => {
      calls++;
      return Promise.reject(new EvidenceError("proof mismatch"));
    }),
    /proof mismatch/,
  );
  assert.equal(calls, 1);
});

await test("unavailable transport exhausts three attempts and never returns verified", async () => {
  let calls = 0;
  await assert.rejects(
    verificationWithRetry(() => {
      calls++;
      return Promise.reject(new TransientEvidenceError("offline"));
    }),
    /offline/,
  );
  assert.equal(calls, 3);
});
