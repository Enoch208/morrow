import assert from "node:assert/strict";
import test from "node:test";
import { normalizedReceiptLog } from "../src/market-log-check.ts";

await test("T59 omitted receipt removal metadata agrees only with explicitly nonremoved block logs", () => {
  const receipt = {
    address: "receipt-emitter",
    index: 1,
    data: "0x01",
    topics: [],
    transactionIndex: 0,
  };
  assert.deepEqual(
    normalizedReceiptLog(receipt),
    normalizedReceiptLog({ ...receipt, removed: false }),
  );
  assert.throws(() => normalizedReceiptLog({ ...receipt, removed: true }));
  assert.throws(() => normalizedReceiptLog({ ...receipt, removed: "false" }));
  assert.notDeepEqual(
    normalizedReceiptLog(receipt),
    normalizedReceiptLog({ ...receipt, data: "0x02" }),
  );
  assert.notDeepEqual(
    normalizedReceiptLog(receipt),
    normalizedReceiptLog({ ...receipt, index: 2 }),
  );
});
