import assert from "node:assert/strict";
import test from "node:test";
import { parseProof } from "../src/proof.ts";

const word = `0x${"ab".repeat(32)}`;
const fixture = {
  chainKey: 1,
  headerNumber: 12,
  txHash: word,
  txIndex: 999,
  txBytes: "0x0102",
  merkleProof: { root: word, siblings: [{ hash: word, isLeft: false }] },
  continuityProof: { lowerEndpointDigest: word, roots: [word] },
};

await test("T30 prover-supplied transaction index never enters the native envelope", () => {
  const proof = parseProof(fixture, word);
  assert.equal(proof.blockHeight, 12n);
  assert.equal("txIndex" in proof, false);
  assert.equal("provenTxIndex" in proof, false);
});

await test("T21 malformed proof transport fields fail before encoding", () => {
  assert.throws(() => parseProof({ ...fixture, headerNumber: Number.MAX_SAFE_INTEGER + 1 }, word));
  assert.throws(() => parseProof({ ...fixture, txBytes: "0x0" }, word));
  assert.throws(() => parseProof({ ...fixture, txHash: `0x${"cd".repeat(32)}` }, word));
  assert.throws(() =>
    parseProof(
      { ...fixture, merkleProof: { root: word, siblings: [{ hash: word, isLeft: "false" }] } },
      word,
    ),
  );
});
