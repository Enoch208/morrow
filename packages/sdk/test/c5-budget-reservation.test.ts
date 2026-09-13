import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Transaction, toBeHex } from "ethers";
import { reserveC5Budget } from "../src/c5-budget-reservation.ts";
import { persistThenBroadcast } from "../src/submission-intent.ts";
import { requireC5Action } from "../src/c5-call-policy.ts";
import { campaignContracts } from "../src/campaign-config.ts";

const cost = 11000000000000000n;
const entry = (action: string) => ({
  action, state: "prepared", chainId: "102031", costCeiling: cost.toString(),
});

function signal() {
  let complete: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { complete = resolve; });
  return {
    promise,
    resolve() {
      if (!complete) throw new Error("Missing test signal resolver");
      complete();
    },
  };
}

await test("C5 concurrent different-action reservations cannot both consume the same remaining cap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-c5-budget-"));
  const entered = signal();
  const release = signal();
  const records: Record<string, unknown>[] = [];
  const first = reserveC5Budget(directory, "c5-withdraw-seller", 102031n, cost, async () => {
    const snapshot = [...records];
    entered.resolve();
    await release.promise;
    return snapshot;
  }, () => {
    records.push(entry("c5-withdraw-seller"));
    return Promise.resolve();
  });
  try {
    await entered.promise;
    const second = () => reserveC5Budget(
      directory, "c5-withdraw-fee", 102031n, cost,
      () => Promise.resolve([...records]),
      () => {
        records.push(entry("c5-withdraw-fee"));
        return Promise.resolve();
      },
    );
    await assert.rejects(second(), /EEXIST/);
    release.resolve();
    await first;
    await assert.rejects(second(), /cap exceeded/);
    assert.deepEqual(records, [entry("c5-withdraw-seller")]);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    release.resolve();
    await first;
    await rm(directory, { recursive: true });
  }
});

await test("C5 failed journal writes release reservation locks while stale locks fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-c5-budget-"));
  const failure = new Error("Journal unavailable");
  try {
    await assert.rejects(reserveC5Budget(
      directory, "c5-r2-fund", 102031n, cost,
      () => Promise.resolve([]), () => Promise.reject(failure),
    ), (error: unknown) => error === failure);
    assert.deepEqual(await readdir(directory), []);
    await writeFile(join(directory, "budget-reservation.lock"), "stale", { flag: "wx" });
    let prepared = false;
    await assert.rejects(reserveC5Budget(
      directory, "c5-r2-fund", 102031n, cost,
      () => Promise.resolve([]),
      () => {
        prepared = true;
        return Promise.resolve();
      },
    ), /EEXIST/);
    assert.equal(prepared, false);
    assert.equal(await readFile(join(directory, "budget-reservation.lock"), "utf8"), "stale");
  } finally {
    await rm(directory, { recursive: true });
  }
});

await test("C5 rejected budget reservation preserves durable action intent and never broadcasts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-c5-budget-"));
  const transaction = Transaction.from({
    chainId: 102031n, to: campaignContracts.market.address, value: 0n,
    gasLimit: 11000n, gasPrice: 1000000000000n, nonce: 0, type: 0,
    signature: { r: toBeHex(1n, 32), s: toBeHex(1n, 32), v: 27 },
  });
  const signed = transaction.serialized;
  const hash = transaction.hash;
  assert.ok(hash);
  let broadcasts = 0;
  const submit = () => persistThenBroadcast(
    directory, "c5-withdraw-fee", signed,
    () => reserveC5Budget(
      directory, "c5-withdraw-fee", 102031n, cost,
      () => Promise.resolve([entry("c5-withdraw-seller")]),
      () => Promise.reject(new Error("Unexpected preparation")),
    ),
    () => {
      broadcasts++;
      return Promise.resolve({ hash });
    },
    requireC5Action,
  );
  try {
    await assert.rejects(submit(), /cap exceeded/);
    assert.equal(broadcasts, 0);
    const intent = await readFile(join(directory, "c5-withdraw-fee.submission-lock"), "utf8");
    assert.ok(intent.includes(hash));
    assert.ok(!intent.includes(signed));
    assert.deepEqual(await readdir(directory), ["c5-withdraw-fee.submission-lock"]);
    await assert.rejects(submit(), /EEXIST/);
    assert.equal(broadcasts, 0);
  } finally {
    await rm(directory, { recursive: true });
  }
});
