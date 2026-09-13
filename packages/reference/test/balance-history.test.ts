import assert from "node:assert/strict";
import test from "node:test";
import { reconstructBalance, requireMovement } from "../src/balance-history.ts";

await test("T59 token reconciliation separates two transactions in one block", () => {
  const changes = [
    { transactionIndex: 1, from: "payer", to: "vault", amount: 100n },
    { transactionIndex: 3, from: "vault", to: "buyer", amount: 40n },
  ];
  assert.deepEqual(reconstructBalance("vault", 0n, 60n, changes, 3), {
    beforeTransaction: 100n,
    afterTransaction: 60n,
    blockDelta: 60n,
  });
  assert.deepEqual(reconstructBalance("vault", 0n, 60n, changes, 2), {
    beforeTransaction: 100n,
    afterTransaction: 100n,
    blockDelta: 60n,
  });
  assert.throws(() => reconstructBalance("vault", 0n, 61n, changes, 3));
});

await test("T59 receipt transfers cannot be replaced by an unrelated payment or wrong units", () => {
  const payment = { from: "market", to: "seller", amount: 9362950000n, transactionIndex: 1 };
  assert.doesNotThrow(() => {
    requireMovement([payment], payment);
  });
  assert.throws(() => {
    requireMovement([payment], { ...payment, amount: 9410000000n });
  });
  assert.throws(() => {
    requireMovement([payment], { ...payment, to: "buyer" });
  });
  assert.throws(() => {
    requireMovement([], payment);
  });
  assert.throws(() => {
    requireMovement([payment], null);
  });
});
