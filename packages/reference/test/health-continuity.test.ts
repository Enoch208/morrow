import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { refreshHealthContinuity } from "../src/health-continuity.ts";
import { loadHealthProofs } from "../src/health-inputs.ts";
import { requireSameProof } from "../src/health-proof.ts";
import { HealthMismatch } from "../src/health-rpc.ts";

const proofFiles = new Map([
  [
    "0x8644bdc30316a06a114dc1a49641a7df19e1335a547eed1361242484bef7c057",
    "../../../evidence/campaign/b-reserve-1789254060034-a2614da9aec7b18ca4ab86d4a75b94bbad78bf0cdfeccf8ab05240820b408dd8.json",
  ],
  [
    "0xace2eba674a6a9374364d84c5de16bc42967361ee4f12bcb61aa84eb940f7e2d",
    "../../../evidence/c5/c5-r1-cancel-original-1789297798723-9747784e53f2d71d4d8617954de2149768ff3be0fa516f0fe6fbdec07bbc9780.json",
  ],
]);

async function proof(hash: string): Promise<Record<string, unknown>> {
  const path = proofFiles.get(hash);
  if (!path) throw new Error("Unknown test proof");
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
}

void test("current health refresh preserves both authentic attack envelopes", async () => {
  for (const item of await loadHealthProofs()) {
    const body = await proof(item.sourceTransactionHash);
    const refreshed = await refreshHealthContinuity(
      item.sourceTransactionHash,
      item.nativeCalldata,
      item.marketCalldata,
      item.correctMarketCalldata,
      () => Promise.resolve(Response.json(body)),
    );
    assert.equal(
      requireSameProof(refreshed.nativeCalldata, refreshed.marketCalldata),
      requireSameProof(item.nativeCalldata, item.marketCalldata),
    );
    if (refreshed.correctMarketCalldata)
      assert.equal(
        requireSameProof(refreshed.nativeCalldata, refreshed.correctMarketCalldata),
        requireSameProof(item.nativeCalldata, item.correctMarketCalldata ?? "0x"),
      );
  }
});

void test("continuity refresh rejects changed transaction identity or Merkle evidence", async () => {
  const item = (await loadHealthProofs())[0];
  assert.ok(item);
  const body = await proof(item.sourceTransactionHash);
  await assert.rejects(
    refreshHealthContinuity(
      item.sourceTransactionHash,
      item.nativeCalldata,
      item.marketCalldata,
      item.correctMarketCalldata,
      () => Promise.resolve(Response.json({ ...body, txHash: `0x${"00".repeat(32)}` })),
    ),
    HealthMismatch,
  );
  const merkleProof = { ...(body.merkleProof as Record<string, unknown>), root: `0x${"00".repeat(32)}` };
  await assert.rejects(
    refreshHealthContinuity(
      item.sourceTransactionHash,
      item.nativeCalldata,
      item.marketCalldata,
      item.correctMarketCalldata,
      () => Promise.resolve(Response.json({ ...body, merkleProof })),
    ),
    HealthMismatch,
  );
});
