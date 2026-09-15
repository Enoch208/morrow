import assert from "node:assert/strict";
import test from "node:test";
import { Block, JsonRpcProvider, ZeroAddress, ZeroHash } from "ethers";
import type { TransactionRequest } from "ethers";
import { assertFreshTimestamp, finishPreparation } from "../src/browser-action-context.ts";
import { tradeContracts } from "../src/trade-contracts.ts";
import { contractInterfaces } from "../src/contract-reads.ts";

class SimulationRpc extends JsonRpcProvider {
  readonly calls: TransactionRequest[] = [];
  changed = false;
  fails = false;
  constructor() {
    super(undefined, undefined, { cacheTimeout: -1 });
  }
  override getBlock(): Promise<Block> {
    return Promise.resolve(
      new Block(
        {
          number: 10,
          hash: this.changed ? ZeroHash : `0x${"11".repeat(32)}`,
          timestamp: Math.floor(Date.now() / 1000),
          parentHash: ZeroHash,
          nonce: "0x0000000000000000",
          difficulty: 0n,
          gasLimit: 30000000n,
          gasUsed: 0n,
          miner: ZeroAddress,
          extraData: "0x",
          baseFeePerGas: 1n,
          transactions: [],
        },
        this,
      ),
    );
  }
  override call(transaction: TransactionRequest): Promise<string> {
    this.calls.push(transaction);
    return this.fails ? Promise.reject(new Error("simulation refused")) : Promise.resolve("0x");
  }
}

const actor = "0x0000000000000000000000000000000000000001";

await test("prepared withdrawal carries exact signer, target, network and simulation block", async () => {
  const rpc = new SimulationRpc();
  try {
    const block = await rpc.getBlock();
    const data = contractInterfaces.market.encodeFunctionData("withdraw");
    const prepared = await finishPreparation(rpc, block, "withdraw", actor, "market", data);
    assert.equal(prepared.chainId, 102031n);
    assert.equal(prepared.expectedSigner, actor);
    assert.equal(prepared.to, tradeContracts.market.address);
    assert.equal(prepared.checkedBlockHash, block.hash);
    assert.deepEqual(rpc.calls, [
      { to: tradeContracts.market.address, from: actor, data, blockTag: 10 },
    ]);
  } finally {
    rpc.destroy();
  }
});

await test("simulation refusal and block reorganization cannot produce prepared transactions", async () => {
  const rpc = new SimulationRpc();
  try {
    const block = await rpc.getBlock();
    rpc.changed = true;
    await assert.rejects(
      finishPreparation(rpc, block, "withdraw", actor, "market", "0x3ccfd60b"),
      /reorganized/,
    );
    rpc.changed = false;
    rpc.fails = true;
    await assert.rejects(
      finishPreparation(rpc, block, "withdraw", actor, "market", "0x3ccfd60b"),
      /simulation refused/,
    );
  } finally {
    rpc.destroy();
  }
});

await test("stale RPC snapshots and funding cutoffs are rejected before signing", () => {
  const now = BigInt(Math.floor(Date.now() / 1000));
  assertFreshTimestamp(now);
  assert.throws(() => {
    assertFreshTimestamp(now - 121n);
  });
  assert.throws(() => {
    assertFreshTimestamp(now + 31n);
  });
  assert.throws(() => {
    assertFreshTimestamp(now, now);
  });
});
