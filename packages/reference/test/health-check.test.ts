import { test } from "node:test";
import assert from "node:assert/strict";
import { accountingVerdict, currentChainHealth, healthCheck } from "../src/health-check.ts";
import { HealthMismatch, HealthUnavailable } from "../src/health-rpc.ts";
import { summarizeHealth, verifyHealth } from "../src/health-report.ts";
import { loadHealthProofs } from "../src/health-inputs.ts";
import { requireSameProof } from "../src/health-proof.ts";

void test("accounting refuses underbacking and inconsistent liabilities", () => {
  assert.throws(() => accountingVerdict(3n, 2n, 4n, 100n), HealthMismatch);
  assert.throws(() => accountingVerdict(3n, 2n, 5n, 4n), HealthMismatch);
  assert.match(accountingVerdict(3n, 2n, 5n, 7n), /5 liabilities = 3 bound \+ 2 credits/);
});

void test("only demonstrated mismatches fail; transport missing data stays unverified", async () => {
  const failed = await healthCheck("test", "test", () =>
    Promise.reject(new HealthMismatch("Mismatch")),
  );
  const missing = await healthCheck("test", "test", () =>
    Promise.reject(new HealthUnavailable("Unavailable")),
  );
  assert.equal(failed.status, "FAIL");
  assert.equal(missing.status, "UNVERIFIED");
  assert.equal(summarizeHealth([failed, missing]).verdict, "FAIL");
  assert.equal(summarizeHealth([]).verdict, "UNVERIFIED");
});

void test("RPC outage preserves all unperformed core check lines", async () => {
  const result = await currentChainHealth(
    "source",
    [{ url: "https://rpc.invalid", chainId: 11155111 }],
    () => Promise.reject(new Error("unavailable")),
  );
  assert.equal(result.session, null);
  assert.equal(result.checks.length, 6);
  assert.ok(result.checks.every((check) => check.status === "UNVERIFIED"));
});

void test("missing proof inputs cannot reduce the denominator into a green report", async () => {
  const result = await verifyHealth([], () => Promise.reject(new Error("unavailable")));
  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.checks.length, 17);
  assert.equal(
    result.checks.filter(
      (check) => check.id.includes("wrong-sale") || check.id.includes("stale-round"),
    ).length,
    4,
  );
});

void test("recorded correct-sale and wrong-sale calls contain exactly the same native proof", async () => {
  const cases = await loadHealthProofs();
  assert.equal(cases.length, 2);
  for (const proof of cases) {
    const fingerprint = requireSameProof(proof.nativeCalldata, proof.marketCalldata);
    if (proof.correctMarketCalldata)
      assert.equal(
        requireSameProof(proof.nativeCalldata, proof.correctMarketCalldata),
        fingerprint,
      );
  }
  const first = cases[0];
  const second = cases[1];
  assert.ok(first && second);
  assert.throws(
    () => requireSameProof(first.nativeCalldata, second.marketCalldata),
    HealthMismatch,
  );
});
