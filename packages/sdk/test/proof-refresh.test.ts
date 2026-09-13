import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { makeError } from "ethers";
import type { ProofEnvelope } from "@morrow/protocol";
import { parseProof } from "../src/proof.ts";
import { assertContinuityOnly, resolveHeldProof } from "../src/proof-refresh.ts";

const hash = "0xf761898b50db1081955f52aaab4cf02891b4b0586a299ab60d0c206cce0e5028";
const raw: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../../../evidence/campaign/a-assign-1789254577056-152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const original = parseProof(raw, hash);
const refreshed = {
  ...original,
  continuityProof: {
    ...original.continuityProof,
    roots: [...original.continuityProof.roots].reverse(),
  },
};
const rejection = makeError("Continuity rejected", "CALL_EXCEPTION", {
  action: "call",
  data: "0x",
  reason: "Continuity proof does not match attestation or checkpoint",
  transaction: { to: null, data: "0x" },
  invocation: null,
  revert: null,
});
const unexpectedRefresh = () => Promise.reject(new Error("Refresh must not be called"));

await test("EVD-002A continuity refresh cannot change authenticated transaction components", () => {
  assert.doesNotThrow(() => {
    assertContinuityOnly(original, refreshed);
  });
  const changed: ProofEnvelope[] = [
    { ...refreshed, chainKey: 2n },
    { ...refreshed, blockHeight: original.blockHeight + 1n },
    { ...refreshed, encodedTransaction: "0x12" },
    { ...refreshed, merkleProof: { ...original.merkleProof, root: hash } },
    { ...refreshed, merkleProof: { ...original.merkleProof, siblings: [] } },
    {
      ...refreshed,
      merkleProof: {
        ...original.merkleProof,
        siblings: original.merkleProof.siblings.map((entry) => ({
          ...entry,
          isLeft: !entry.isLeft,
        })),
      },
    },
  ];
  for (const proof of changed)
    assert.throws(() => {
      assertContinuityOnly(original, proof);
    });
});

await test("EVD-002A accepted original envelope is used without refreshing", async () => {
  const selected = await resolveHeldProof(original, unexpectedRefresh, () =>
    Promise.resolve("native-accepted"),
  );
  assert.equal(selected.proof, original);
  assert.equal(selected.refreshed, null);
  assert.equal(selected.originalRejection, null);
});

await test("EVD-002A continuity rejection requires a new successful native verification", async () => {
  let calls = 0;
  const selected = await resolveHeldProof(
    original,
    () => Promise.resolve({ proof: refreshed, raw }),
    (proof) => {
      calls += 1;
      return proof === original ? Promise.reject(rejection) : Promise.resolve("native-accepted");
    },
  );
  assert.equal(calls, 2);
  assert.equal(selected.proof, refreshed);
  assert.equal(selected.originalRejection?.reason, rejection.reason);
});

await test("T21 transport errors and unrelated native refusals never trigger refresh", async () => {
  const unrelated = makeError("Invalid Merkle proof", "CALL_EXCEPTION", {
    action: "call",
    data: "0x",
    reason: "Invalid Merkle proof",
    transaction: { to: null, data: "0x" },
    invocation: null,
    revert: null,
  });
  for (const failure of [new Error("Network unavailable"), unrelated])
    await assert.rejects(
      resolveHeldProof(original, unexpectedRefresh, () => Promise.reject(failure)),
      (error: unknown) => error === failure,
    );
});

await test("T21 changed source components, unavailable prover and rejected refreshed proof fail closed", async () => {
  await assert.rejects(
    resolveHeldProof(
      original,
      () => Promise.resolve({ proof: { ...refreshed, blockHeight: 1n }, raw }),
      () => Promise.reject(rejection),
    ),
    /Authenticated proof components changed/,
  );
  await assert.rejects(
    resolveHeldProof(
      original,
      () => Promise.reject(new Error("Prover unavailable")),
      () => Promise.reject(rejection),
    ),
    /Prover unavailable/,
  );
  await assert.rejects(
    resolveHeldProof(
      original,
      () => Promise.resolve({ proof: refreshed, raw }),
      () => Promise.reject(rejection),
    ),
    (error: unknown) => error === rejection,
  );
});
