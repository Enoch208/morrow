import assert from "node:assert/strict";
import test from "node:test";
import { assertC5RefusalFinality } from "../src/c5-refusal.ts";

await test("C5 refusal waits for assignment finality without misclassifying invalid heights", () => {
  assert.throws(() => {
    assertC5RefusalFinality(99, 100);
  }, /C5 refusal source assignment is unfinalized/);
  assert.doesNotThrow(() => {
    assertC5RefusalFinality(100, 100);
  });
  assert.doesNotThrow(() => {
    assertC5RefusalFinality(101, 100);
  });
  for (const height of [NaN, -1, 1.5, Infinity]) {
    assert.throws(() => {
      assertC5RefusalFinality(height, 100);
    }, /Invalid C5 refusal block height/);
    assert.throws(() => {
      assertC5RefusalFinality(100, height);
    }, /Invalid C5 refusal block height/);
  }
});
