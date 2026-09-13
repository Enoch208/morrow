import assert from "node:assert/strict";
import test from "node:test";
import { compiledRuntime, maskImmutables } from "../src/runtime.ts";

await test("runtime provenance masks only compiler-declared immutable ranges", () => {
  assert.equal(maskImmutables("0x1234abcd", [{ start: 1, length: 2 }]), "0x120000cd");
  assert.notEqual(
    maskImmutables("0x1234abcd", [{ start: 1, length: 2 }]),
    maskImmutables("0x9934abcd", [{ start: 1, length: 2 }]),
  );
  assert.throws(() => maskImmutables("0x1234", [{ start: 1, length: 2 }]));
  assert.throws(() => maskImmutables("0x1234", [{ start: -1, length: 1 }]));
});

await test("compiler artifacts without immutables retain their entire runtime for comparison", () => {
  const emitter = compiledRuntime("NativeSpikeEmitter");
  assert.deepEqual(emitter.ranges, []);
  assert.equal(maskImmutables(emitter.code, emitter.ranges), emitter.code.toLowerCase());
});
