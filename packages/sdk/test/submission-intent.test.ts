import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { keccak256, Wallet } from "ethers";
import { persistThenBroadcast, submissionLocks } from "../src/submission-intent.ts";

const wallet = Wallet.createRandom();
const signed = await wallet.signTransaction({
  chainId: 11155111n,
  to: wallet.address,
  nonce: 0,
  gasLimit: 21000n,
  gasPrice: 1n,
  value: 0n,
  type: 0,
});
const hash = keccak256(signed);

await test("T56 durable public intent precedes prepare journal and broadcast without storing signed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-intent-"));
  try {
    const order: string[] = [];
    const response = await persistThenBroadcast(
      directory,
      "b-redeem",
      signed,
      async (transactionHash) => {
        const lock = await readFile(join(directory, "b-redeem.submission-lock"), "utf8");
        assert.equal(transactionHash, hash);
        assert.ok(lock.includes(hash));
        assert.ok(!lock.includes(signed));
        assert.deepEqual(await submissionLocks(directory), new Set(["b-redeem"]));
        order.push("prepared");
      },
      (raw) => {
        assert.equal(raw, signed);
        assert.deepEqual(order, ["prepared"]);
        order.push("broadcast");
        return Promise.resolve({ hash });
      },
    );
    assert.equal(response.hash, hash);
    assert.deepEqual(order, ["prepared", "broadcast"]);
  } finally {
    await rm(directory, { recursive: true });
  }
});

await test("T56 prepare failure and ambiguous broadcast retain intent and refuse a second submission", async () => {
  for (const boundary of ["prepared", "broadcast"]) {
    const directory = await mkdtemp(join(tmpdir(), "morrow-intent-"));
    let broadcasts = 0;
    const send = () => {
      broadcasts++;
      return Promise.reject(new Error("transport response lost"));
    };
    try {
      await assert.rejects(
        persistThenBroadcast(
          directory,
          "b-redeem",
          signed,
          () =>
            boundary === "prepared"
              ? Promise.reject(new Error("journal unavailable"))
              : Promise.resolve(),
          send,
        ),
      );
      assert.equal(broadcasts, boundary === "prepared" ? 0 : 1);
      const lock = await readFile(join(directory, "b-redeem.submission-lock"), "utf8");
      assert.ok(lock.includes(hash));
      await assert.rejects(
        persistThenBroadcast(directory, "b-redeem", signed, () => Promise.resolve(), send),
      );
      assert.equal(broadcasts, boundary === "prepared" ? 0 : 1);
    } finally {
      await rm(directory, { recursive: true });
    }
  }
});

await test("T56 concurrent attempts admit one sender and empty locks are visible for reconciliation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-intent-"));
  try {
    let broadcasts = 0;
    const attempt = () =>
      persistThenBroadcast(
        directory,
        "b-redeem",
        signed,
        () => Promise.resolve(),
        () => {
          broadcasts++;
          return Promise.resolve({ hash });
        },
      );
    const results = await Promise.allSettled([attempt(), attempt()]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(broadcasts, 1);
    await writeFile(join(directory, "a-settle.submission-lock"), "", { flag: "wx" });
    assert.deepEqual(await submissionLocks(directory), new Set(["a-settle", "b-redeem"]));
    await assert.rejects(
      persistThenBroadcast(
        directory,
        "a-settle",
        signed,
        () => Promise.resolve(),
        () => {
          broadcasts++;
          return Promise.resolve({ hash });
        },
      ),
    );
    assert.equal(broadcasts, 1);
  } finally {
    await rm(directory, { recursive: true });
  }
});

await test("T56 malformed, mainnet or path-traversing intent cannot reach broadcast", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-intent-"));
  try {
    let broadcasts = 0;
    const send = () => {
      broadcasts++;
      return Promise.resolve({ hash });
    };
    const mainnet = await wallet.signTransaction({
      chainId: 1n,
      to: wallet.address,
      nonce: 0,
      gasLimit: 21000n,
      gasPrice: 1n,
      type: 0,
    });
    for (const [action, raw] of [
      ["../b-redeem", signed],
      ["b-redeem", "0x"],
      ["b-redeem", mainnet],
    ] as const)
      await assert.rejects(
        persistThenBroadcast(directory, action, raw, () => Promise.resolve(), send),
      );
    assert.equal(broadcasts, 0);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true });
  }
});

await test("T56 another hash in the broadcast response cannot replace the durable original", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-intent-"));
  try {
    await assert.rejects(
      persistThenBroadcast(
        directory,
        "b-redeem",
        signed,
        () => Promise.resolve(),
        () => Promise.resolve({ hash: keccak256("0x") }),
      ),
    );
    assert.ok((await readFile(join(directory, "b-redeem.submission-lock"), "utf8")).includes(hash));
    assert.deepEqual(await submissionLocks(directory), new Set(["b-redeem"]));
  } finally {
    await rm(directory, { recursive: true });
  }
});
