import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { localRole, repositoryRoot } from "../src/environment.ts";
import { contractArtifact } from "../src/artifact.ts";

await test("missing local role key fails without exposing supplied content", () => {
  assert.throws(() => localRole({}, "PAYER"), /PAYER_PRIVATE_KEY missing/);
  assert.throws(
    () => localRole({ SELLER_PRIVATE_KEY: "secret-test-value" }, "SELLER"),
    (error: unknown) => error instanceof Error && !error.message.includes("secret-test-value"),
  );
});

await test("artifact loader is rooted in this repository and rejects traversal", () => {
  assert.ok(isAbsolute(repositoryRoot));
  assert.equal(
    realpathSync(resolve(repositoryRoot, "packages/sdk/test/environment.test.ts")),
    realpathSync(fileURLToPath(import.meta.url)),
  );
  assert.throws(() => contractArtifact("../../.env"), /Invalid artifact name/);
  const artifact = contractArtifact("NativeSpikeReceiver");
  assert.equal(artifact.abi.getFunction("accept")?.name, "accept");
  assert.ok(artifact.bytecode.length > 2);
});
