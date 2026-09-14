import assert from "node:assert/strict";
import test from "node:test";
import { Interface, makeError } from "ethers";
import {
  assertRefusalReceipt,
  decodeExpectedRefusal,
  refusalGasLimit,
} from "../src/mined-refusal.ts";

const errors = new Interface(["error SaleIdMismatch()", "error EventAlreadyConsumed()"]);

function callException(data: string, reason: string | null = null) {
  return makeError("fixture revert", "CALL_EXCEPTION", {
    action: "call",
    data,
    reason,
    transaction: { to: null, data: "0x" },
    invocation: null,
    revert: null,
  });
}

await test("expected refusal accepts only the exact decoded custom error", () => {
  const mismatch = callException(errors.encodeErrorResult("SaleIdMismatch"));
  assert.equal(decodeExpectedRefusal(mismatch, errors, "SaleIdMismatch").name, "SaleIdMismatch");
  assert.throws(
    () => decodeExpectedRefusal(mismatch, errors, "EventAlreadyConsumed"),
    /Unexpected refusal/,
  );
  assert.throws(
    () => decodeExpectedRefusal(new Error("RPC unavailable"), errors, "SaleIdMismatch"),
    /Expected EVM refusal/,
  );
});

await test("expected refusal supports an exact native revert reason", () => {
  const reason = "Continuity proof does not match attestation or checkpoint";
  const refusal = decodeExpectedRefusal(callException("0x08c379a0", reason), errors, reason);
  assert.equal(refusal.name, reason);
  assert.equal(refusal.reason, reason);
});

await test("refusal gas is derived from successful proof receipts and bounded by the block", () => {
  assert.equal(refusalGasLimit(30_000_000n, [800_000n, 1_100_000n]), 2_200_000n);
  assert.equal(refusalGasLimit(4_000_000n, [1_100_000n]), 2_000_000n);
  assert.throws(() => refusalGasLimit(4_000_000n, []), /proof gas baseline/);
  assert.throws(() => refusalGasLimit(1_000_000n, [800_000n]), /cannot fit/);
});

await test("mined refusal requires a canonical failed receipt with no logs", () => {
  const receipt = {
    status: 0,
    hash: "0x01",
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002",
    blockNumber: 9,
    blockHash: "0x02",
    gasUsed: 900_000n,
    logs: [],
  };
  assert.doesNotThrow(() => {
    assertRefusalReceipt(
      receipt,
      receipt.hash,
      receipt.from,
      receipt.to,
      receipt.blockNumber,
      receipt.blockHash,
      1_000_000n,
    );
  });
  assert.throws(() => {
    assertRefusalReceipt(
      { ...receipt, status: 1 },
      receipt.hash,
      receipt.from,
      receipt.to,
      9,
      receipt.blockHash,
      1_000_000n,
    );
  }, /did not revert/);
  assert.throws(() => {
    assertRefusalReceipt(
      { ...receipt, logs: [{}] },
      receipt.hash,
      receipt.from,
      receipt.to,
      9,
      receipt.blockHash,
      1_000_000n,
    );
  }, /retained logs/);
});
