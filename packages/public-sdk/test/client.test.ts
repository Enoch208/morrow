import { test } from "node:test";
import assert from "node:assert/strict";
import { Block, JsonRpcProvider, Network, ZeroAddress, ZeroHash } from "ethers";
import { MorrowReadClient } from "../src/client.ts";

function block(provider: JsonRpcProvider, hash = ZeroHash) {
  return new Block(
    {
      number: 100,
      timestamp: 1800000000,
      hash,
      parentHash: ZeroHash,
      nonce: "0x0000000000000000",
      difficulty: 0n,
      gasLimit: 1000000n,
      gasUsed: 0n,
      miner: ZeroAddress,
      extraData: "0x",
      baseFeePerGas: 0n,
      transactions: [],
    },
    provider,
  );
}

for (const scenario of ["wrong-chain", "missing-finality", "wrong-runtime", "transport"] as const) {
  void test(`public read client fails closed on ${scenario}`, async (t) => {
    const client = new MorrowReadClient({
      sourceRpcUrl: "http://127.0.0.1:1",
      destinationRpcUrl: "http://127.0.0.1:1",
    });
    t.after(() => {
      client.destroy();
    });
    t.mock.method(JsonRpcProvider.prototype, "getNetwork", () =>
      scenario === "transport"
        ? Promise.reject(new Error("private URL credential"))
        : Promise.resolve(Network.from(scenario === "wrong-chain" ? 1 : 11155111)),
    );
    t.mock.method(JsonRpcProvider.prototype, "getBlock", function (this: JsonRpcProvider) {
      return Promise.resolve(scenario === "missing-finality" ? null : block(this));
    });
    t.mock.method(JsonRpcProvider.prototype, "getCode", () => Promise.resolve("0x1234"));
    const call = t.mock.method(JsonRpcProvider.prototype, "call", () =>
      Promise.reject(new Error("A failed pin check must not read the claim")),
    );
    const result = await client.readClaim(2n);
    assert.equal(result.status, "unverifiable");
    assert.equal(call.mock.callCount(), 0);
    assert.ok(!JSON.stringify(result).includes("credential"));
  });
}

void test("public client rejects malformed sale and nonpositive claim identities before RPC", async () => {
  const client = new MorrowReadClient({
    sourceRpcUrl: "http://127.0.0.1:1",
    destinationRpcUrl: "http://127.0.0.1:1",
  });
  try {
    await assert.rejects(client.readClaim(0n), /positive/);
    await assert.rejects(client.readSale("0x1234"), /bytes32/);
  } finally {
    client.destroy();
  }
});
