import assert from "node:assert/strict";
import test from "node:test";
import { checkManifestDeployment } from "../src/manifest-deployment-check.ts";
import { runtimeFixture } from "./runtime-substitution-fixture.ts";

await test("T60 actual deployment checker accepts pinned archived constructor and runtime baseline", async (t) => {
  for (const role of ["sourceToken", "settlementToken", "vault", "market"] as const) {
    const { deployment, rpc } = await runtimeFixture(role);
    t.after(() => {
      rpc.destroy();
    });
    await assert.doesNotReject(checkManifestDeployment(deployment, rpc));
    assert.deepEqual(rpc.checked, ["transaction", "receipt", "runtime", "block"]);
  }
});

await test("T60 return-true mock, empty runtime and changed immutable cannot pass deployment verification", async (t) => {
  for (const mutation of ["mock", "empty", "immutable"] as const) {
    const { deployment, rpc, immutableOffset } = await runtimeFixture("market");
    t.after(() => {
      rpc.destroy();
    });
    rpc.runtime =
      mutation === "mock"
        ? "0x600160005260206000f3"
        : mutation === "empty"
          ? "0x"
          : rpc.runtime.slice(0, immutableOffset) +
            "ff".repeat(32) +
            rpc.runtime.slice(immutableOffset + 64);
    await assert.rejects(
      checkManifestDeployment(deployment, rpc),
      /Mined deployment or runtime mismatch/,
    );
    assert.equal(rpc.checked.includes("block"), false);
  }
});

await test("T60 changed creation bytecode or constructor cannot hide behind correct runtime", async (t) => {
  for (const mutation of ["creation", "constructor", "manifest-constructor"] as const) {
    const { deployment, rpc, creationLength } = await runtimeFixture("market");
    t.after(() => {
      rpc.destroy();
    });
    if (mutation === "creation") rpc.data = "0x00" + rpc.data.slice(4);
    if (mutation === "constructor")
      rpc.data =
        rpc.data.slice(0, creationLength) + "ff".repeat(32) + rpc.data.slice(creationLength + 64);
    const input =
      mutation === "manifest-constructor"
        ? {
            ...deployment,
            constructorArguments: [...deployment.constructorArguments.slice(0, 4), 49],
          }
        : deployment;
    await assert.rejects(
      checkManifestDeployment(input, rpc),
      /Actual deployment calldata differs from compiled constructor/,
    );
  }
});

await test("T60 substituted deployment pins and noncanonical receipts remain rejected", async (t) => {
  const { deployment, rpc } = await runtimeFixture("market");
  t.after(() => {
    rpc.destroy();
  });
  await assert.rejects(
    checkManifestDeployment({ ...deployment, runtimeCodeHash: `0x${"00".repeat(32)}` }, rpc),
    /Deployment provenance differs from fixed release domains/,
  );
  assert.deepEqual(rpc.checked, []);
  rpc.canonical = false;
  await assert.rejects(
    checkManifestDeployment(deployment, rpc),
    /Deployment receipt is not canonical/,
  );
});
