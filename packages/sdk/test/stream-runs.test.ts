import assert from "node:assert/strict";
import test from "node:test";
import { repositoryRoot } from "../src/environment.ts";
import { expectedRefusal, streamSigner, streamSteps } from "../src/stream-config.ts";
import { streamMarketBlock, streamRunDirectory } from "../src/stream-log.ts";

await test("each stream run keeps its own journal and the first run keeps the original path", () => {
  assert.equal(streamRunDirectory(["node", "cli", "reserve"]), `${repositoryRoot}evidence/stream`);
  assert.equal(
    streamRunDirectory(["node", "cli", "reserve", "--run=v2"]),
    `${repositoryRoot}evidence/stream/v2`,
  );
  for (const run of ["--run=", "--run=../v1", "--run=V2", "--run=a/b"]) {
    assert.throws(() => streamRunDirectory(["node", "cli", run]));
  }
});

await test("the assignment log scan starts at the run's own mined market deployment", () => {
  const deployed = { step: "deploy-stream-market", state: "mined", transactionHash: "0x01" };
  assert.equal(streamMarketBlock([{ ...deployed, blockNumber: 5_490_321 }]), 5_490_321);
  assert.throws(() => streamMarketBlock([deployed]));
  assert.throws(() => streamMarketBlock([{ ...deployed, state: "planned", blockNumber: 1 }]));
});

await test("the vault-as-buyer refusal is signed by the seller before the real reservation", () => {
  assert.equal(expectedRefusal["reserve-vault-buyer-refused"], "InvalidBuyer");
  assert.equal(streamSigner["reserve-vault-buyer-refused"], "SELLER");
  assert.ok(
    streamSteps.indexOf("wrap-stream") < streamSteps.indexOf("reserve-vault-buyer-refused") &&
      streamSteps.indexOf("reserve-vault-buyer-refused") < streamSteps.indexOf("reserve"),
  );
});
