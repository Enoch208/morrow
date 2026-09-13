import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Interface } from "ethers";
import { verifySubmissionBytecode } from "../src/submission-bytecode.ts";

const abi = ["function f()"];
const fragment = new Interface(abi).getFunction("f");
assert.ok(fragment);
const selector = fragment.selector.slice(2);
const preamble = "6080604052600436101561001257600080fd5b60003560e01c";
const metadata = `a2646970667358221220${"11".repeat(32)}64736f6c634300081c0033`;

function fixture(body = `5b7f${"00".repeat(32)}00`) {
  const target = preamble.length / 2 + 14;
  const runtime = `0x${preamble}63${selector}1461${target.toString(16).padStart(4, "0")}57600080fd${body}fe${metadata}`;
  const start = target + 2;
  return { runtime, start, references: { "1": [{ start, length: 32 }] } };
}

function replace(runtime: string, offset: number, bytes: string) {
  return runtime.slice(0, 2 + offset * 2) + bytes + runtime.slice(2 + offset * 2 + bytes.length);
}

await test("immutable masking permits only declared PUSH32 bytes and reports observed values", () => {
  const f = fixture();
  const live = replace(f.runtime, f.start, "77".repeat(32));
  const result = verifySubmissionBytecode(live, f.runtime, f.references, abi);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.selectors, [`0x${selector}`]);
  assert.deepEqual(result.immutables, [
    { id: "1", value: `0x${"77".repeat(32)}`, offsets: [f.start] },
  ]);
  assert.equal(result.metadataBytes, 53);
  assert.equal(
    verifySubmissionBytecode(replace(live, 0, "61"), f.runtime, f.references, abi).status,
    "fail",
  );
  assert.equal(verifySubmissionBytecode(live + "00", f.runtime, f.references, abi).status, "fail");
  const opcodeLikeImmutable = replace(f.runtime, f.start, "f4f2fff0f5" + "00".repeat(27));
  assert.equal(
    verifySubmissionBytecode(opcodeLikeImmutable, f.runtime, f.references, abi).status,
    "pass",
  );
});

await test("invalid immutable references cannot hide code, overlap, metadata or malformed ranges", () => {
  const f = fixture();
  for (const references of [
    null,
    [],
    { "1": [] },
    { "1": [{ start: -1, length: 32 }] },
    { "1": [{ start: 1.5, length: 32 }] },
    { "1": [{ start: f.start, length: 31 }] },
    { "1": [{ start: f.start - 1, length: 32 }] },
    { "1": [{ start: f.start + 1, length: 32 }] },
    { "1": [{ start: 999999, length: 32 }] },
    {
      "1": [
        { start: f.start, length: 32 },
        { start: f.start, length: 32 },
      ],
    },
    { "1": [{ start: f.start, length: 32 }], "2": [{ start: f.start, length: 32 }] },
  ]) {
    assert.equal(
      verifySubmissionBytecode(f.runtime, f.runtime, references, abi).status,
      "unverified",
    );
  }
});

await test("forbidden executable opcodes fail while PUSH operands are not executed opcodes or selectors", () => {
  for (const opcode of ["f4", "f2", "ff", "f0", "f5"]) {
    const f = fixture(`5b${opcode}00`);
    assert.equal(verifySubmissionBytecode(f.runtime, f.runtime, {}, abi).status, "fail");
  }
  const data = `63deadbeeff4f2fff0f5${"00".repeat(23)}`;
  const f = fixture(`5b7f${data}00`);
  assert.equal(verifySubmissionBytecode(f.runtime, f.runtime, {}, abi).status, "pass");
});

await test("metadata must be a complete recognized Solidity CBOR trailer, not arbitrary excluded bytes", () => {
  const f = fixture();
  for (const invalid of [
    f.runtime.slice(0, -4) + "ffff",
    f.runtime.slice(0, -4) + "0032",
    f.runtime.slice(0, -106) + `a3${f.runtime.slice(-104)}`,
    f.runtime.slice(0, -108) + `00${f.runtime.slice(-106)}`,
  ]) {
    assert.equal(verifySubmissionBytecode(invalid, invalid, {}, abi).status, "unverified");
  }
  const unsafeMetadata = f.runtime.replace("11".repeat(32), "f4".repeat(32));
  assert.equal(
    verifySubmissionBytecode(unsafeMetadata, unsafeMetadata, f.references, abi).status,
    "pass",
  );
});

await test("dispatcher selectors must exactly match ABI and unsupported dispatch remains unverified", () => {
  const f = fixture();
  assert.equal(
    verifySubmissionBytecode(f.runtime, f.runtime, f.references, [...abi, "garbage"]).status,
    "unverified",
  );
  assert.equal(
    verifySubmissionBytecode(f.runtime, f.runtime, f.references, ["function g()"]).status,
    "fail",
  );
  assert.equal(
    verifySubmissionBytecode(f.runtime, f.runtime, f.references, [...abi, "function g()"]).status,
    "fail",
  );
  const fake = f.runtime.replace(preamble, "00".repeat(preamble.length / 2));
  assert.equal(verifySubmissionBytecode(fake, fake, f.references, abi).status, "unverified");
  const wrongTarget = replace(f.runtime, preamble.length / 2 + 7, "0000");
  assert.equal(
    verifySubmissionBytecode(wrongTarget, wrongTarget, f.references, abi).status,
    "unverified",
  );
});

await test("truncated PUSH and a metadata delimiter hidden in PUSH data remain unverified", () => {
  const truncated = fixture("5b7f").runtime;
  const fakeDelimiter = fixture("5b60").runtime;
  for (const runtime of [truncated, fakeDelimiter]) {
    const result = verifySubmissionBytecode(runtime, runtime, {}, abi);
    assert.equal(result.status, "unverified");
    assert.equal(result.opcodeStatus, "unverified");
  }
});

await test("repeated immutable references require consistent values", () => {
  const f = fixture(`5b7f${"00".repeat(32)}7f${"00".repeat(32)}00`);
  const references = {
    "1": [
      { start: f.start, length: 32 },
      { start: f.start + 33, length: 32 },
    ],
  };
  const live = replace(f.runtime, f.start, "22".repeat(32));
  assert.equal(verifySubmissionBytecode(live, f.runtime, references, abi).status, "fail");
});

await test("actual compiled vault and market dispatchers match their complete function ABIs", async () => {
  for (const name of ["FundedPaymentVault", "MorrowMarket"]) {
    const artifact: unknown = JSON.parse(
      await readFile(
        new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.ok(
      artifact &&
        typeof artifact === "object" &&
        "abi" in artifact &&
        "deployedBytecode" in artifact,
    );
    const compiled = artifact.deployedBytecode;
    assert.ok(
      compiled &&
        typeof compiled === "object" &&
        "object" in compiled &&
        "immutableReferences" in compiled,
    );
    assert.equal(typeof compiled.object, "string");
    const iface = new Interface(JSON.stringify(artifact.abi));
    const result = verifySubmissionBytecode(
      String(compiled.object),
      String(compiled.object),
      compiled.immutableReferences,
      iface.fragments,
    );
    assert.equal(result.status, "pass", JSON.stringify(result));
  }
});
