import assert from "node:assert/strict";
import test from "node:test";
import { provider } from "@morrow/sdk/src/environment.ts";
import { nativeInterfaces, nativeAddresses } from "@morrow/sdk/src/native.ts";
import { c5Frontier } from "../src/c5-frontier.ts";
import { c5Job } from "../src/c5-state.ts";

const method = "get_latest_attestation_height_and_hash";
const hash = `0x${"12".repeat(32)}`;
const sourceHash = `0x${"34".repeat(32)}`;

function fixture(t: test.TestContext, tuple: readonly unknown[]) {
  const rpc = provider("http://127.0.0.1:1");
  const calls: unknown[] = [];
  t.mock.method(rpc, "send", (method: string) => {
    calls.push(method);
    if (method === "eth_chainId") return Promise.resolve("0x18e8f");
    if (method === "eth_getBlockByNumber") return Promise.resolve({ hash });
    throw new Error(`Unexpected RPC method: ${method}`);
  });
  t.mock.method(rpc, "getBlock", () => Promise.resolve({ number: 42, hash, timestamp: 100 }));
  t.mock.method(rpc, "call", (request: unknown) => {
    assert.deepEqual(request, {
      to: nativeAddresses.chainInfo,
      data: nativeInterfaces.chainInfo.encodeFunctionData(method, [1]),
      blockTag: 42,
    });
    return Promise.resolve(nativeInterfaces.chainInfo.encodeFunctionResult(method, [tuple]));
  });
  t.after(() => {
    rpc.destroy();
  });
  return { rpc, calls };
}

await test("C5 decodes the installed native tuple and compares the exact attestation height", async (t) => {
  for (const [height, ready] of [
    [9, true],
    [10, true],
    [11, false],
  ] as const) {
    const f = fixture(t, [10n, sourceHash, true, true]);
    const result = await c5Frontier(
      c5Job("proof-r1-cancel"),
      [{ action: "c5-r1-cancel", state: "cancellation-verified", blockNumber: height }],
      () => f.rpc,
    );
    assert.equal(result?.ready, ready);
    assert.equal(result.nativeHeight, "10");
    assert.equal(result.nativeHash, sourceHash);
    assert.equal(result.destinationBlockHash, hash);
  }
});

await test("C5 never treats a missing or non-attestation tuple as ready", async (t) => {
  for (const [attested, exists] of [
    [false, true],
    [true, false],
    [false, false],
  ]) {
    const f = fixture(t, [100n, sourceHash, attested, exists]);
    const result = await c5Frontier(
      c5Job("proof-r2-reserve"),
      [{ action: "c5-r2-reserve", state: "reservation-verified", blockNumber: 10 }],
      () => f.rpc,
    );
    assert.equal(result?.ready, false);
  }
});

await test("C5 rejects reorgs, wrong chains and malformed native return bytes", async (t) => {
  for (const fault of ["reorg", "chain", "bytes"] as const) {
    const f = fixture(t, [100n, sourceHash, true, true]);
    if (fault === "bytes") t.mock.method(f.rpc, "call", () => Promise.resolve("0x"));
    else
      t.mock.method(f.rpc, "send", (method: string) =>
        Promise.resolve(
          method === "eth_chainId" ? (fault === "chain" ? "0x1" : "0x18e8f") : { hash: sourceHash },
        ),
      );
    await assert.rejects(
      c5Frontier(
        c5Job("proof-r1-cancel"),
        [{ action: "c5-r1-cancel", state: "cancellation-verified", blockNumber: 10 }],
        () => f.rpc,
      ),
      fault === "reorg" ? /reorganized/ : fault === "chain" ? /wrong chain/ : /decode/,
    );
  }
});

await test("C5 refuses invalid source heights and does not open an RPC for non-proof jobs", async () => {
  const unavailable = () => {
    throw new Error("RPC must not open");
  };
  assert.equal(await c5Frontier(c5Job("fund"), [], unavailable), null);
  for (const blockNumber of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "10", null]) {
    await assert.rejects(
      c5Frontier(
        c5Job("proof-r1-cancel"),
        [{ action: "c5-r1-cancel", state: "cancellation-verified", blockNumber }],
        unavailable,
      ),
      /verified source block/,
    );
  }
});
