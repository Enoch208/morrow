import assert from "node:assert/strict";
import test from "node:test";
import { makeError, ZeroHash, ZeroAddress } from "ethers";
import type { ProofEnvelope } from "@morrow/protocol";
import { saleTermsFields } from "@morrow/protocol";
import { c5Terms } from "../src/c5-config.ts";
import { saleIdentity } from "../src/canonical.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import { decodedHash } from "../src/decoded-state.ts";
import { nativeInterfaces } from "../src/native.ts";
import { assertC5RefusalState, assertC5RefusalUnchanged } from "../src/c5-refusal-snapshot.ts";
import type { C5RefusalSnapshot } from "../src/c5-refusal-snapshot.ts";
import { assertC5SameProofBytes, c5RefusalCall, c5RefusalError } from "../src/c5-refusal.ts";

const terms = [c5Terms(4n, 1n), c5Terms(4n, 2n)] as const;
const proof: ProofEnvelope = {
  chainKey: 1n,
  blockHeight: 7n,
  encodedTransaction: "0x1234",
  merkleProof: { root: decodedHash(ZeroHash), siblings: [] },
  continuityProof: { lowerEndpointDigest: decodedHash(ZeroHash), roots: [] },
};
const nativeMethod = "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))";
const nativeData = (candidate: ProofEnvelope) =>
  nativeInterfaces.blockProver.encodeFunctionData(nativeMethod, [
    candidate.chainKey,
    candidate.blockHeight,
    candidate.encodedTransaction,
    candidate.merkleProof,
    candidate.continuityProof,
  ]);

function read(method: string, values: readonly unknown[]) {
  const raw = contractInterfaces.market.encodeFunctionResult(method, values);
  return {
    calldata: "0x",
    raw,
    decoded: contractInterfaces.market.decodeFunctionResult(method, raw),
  };
}

function snapshot(): C5RefusalSnapshot {
  const zeroTerms = Object.fromEntries(
    saleTermsFields.map((field) => [field.name, field.type === "address" ? ZeroAddress : 0n]),
  );
  const face = terms[1].sourceFaceValueRaw,
    price = terms[1].grossPurchasePriceRaw;
  return {
    blocks: { source: { number: 7, hash: ZeroHash }, destination: { number: 20, hash: ZeroHash } },
    source: {
      blockNumber: 7,
      blockHash: ZeroHash,
      timestamp: 1789297000,
      claimRaw: "0x01",
      roundRaw: ["0x02", "0x03"],
      backingRaw: "0x04",
      allowanceRaw: "0x00",
      balancesRaw: ["0x05", "0x06", "0x07", "0x08"],
      snapshot: {
        claim: {
          claimId: 4n,
          sourceToken: terms[1].sourceToken,
          sourceFaceValueRaw: face,
          maturity: terms[1].maturity,
          originalBeneficiary: terms[1].seller,
          currentBeneficiary: terms[1].buyer,
          activeRound: 0n,
          latestRound: 2n,
          successfulSale: true,
          redeemed: false,
          referenceHash: decodedHash(ZeroHash),
        },
        rounds: [
          { terms: terms[0], state: 3n, ...saleIdentity(terms[0]) },
          { terms: terms[1], state: 2n, ...saleIdentity(terms[1]) },
        ],
        backing: face,
        allowance: 0n,
        balances: { payer: 10n, seller: 0n, buyer: 0n, vault: face },
      },
    },
    sales: [read("getSale", [[zeroTerms, 0n]]), read("getSale", [[terms[1], 1n]])],
    consumption: [false, true, false].map((value) => read("consumed", [value])),
    totals: [
      read("totalBound", [price]),
      read("totalCredits", [0n]),
      read("totalLiabilities", [price]),
    ],
    balances: [price, 10n, 20n, 30n].map((value) => read("totalBound", [value])),
    credits: [0n, 0n, 0n].map((value) => read("credits", [value])),
  };
}

await test("C5 refusal submits exactly the native-verified old envelope against round 2", () => {
  const call = c5RefusalCall(proof, 1, saleIdentity(terms[1]).saleId);
  assert.doesNotThrow(assertC5SameProofBytes.bind(null, nativeData(proof), call));
  const decoded = contractInterfaces.market.decodeFunctionData("recognizeCancellation", call);
  assert.equal(decoded[1], 1n);
  assert.equal(decoded[2], saleIdentity(terms[1]).saleId);
  assert.throws(
    assertC5SameProofBytes.bind(null, nativeData({ ...proof, encodedTransaction: "0x5678" }), call),
    /identical native proof bytes/,
  );
  assert.throws(
    assertC5SameProofBytes.bind(
      null,
      nativeData({
        ...proof,
        continuityProof: { ...proof.continuityProof, roots: [decodedHash(ZeroHash)] },
      }),
      call,
    ),
    /identical native proof bytes/,
  );
});

await test("C5 refusal publishes actual first error and never turns RPC failure into semantic refusal", () => {
  for (const name of ["SaleIdMismatch", "TermsHashMismatch"] as const) {
    const data = contractInterfaces.market.encodeErrorResult(name);
    const error = makeError("fixture revert", "CALL_EXCEPTION", {
      action: "call",
      data,
      reason: null,
      transaction: { to: null, data: "0x" },
      invocation: null,
      revert: null,
    });
    const actual = c5RefusalError(error);
    assert.equal(actual.reverted, true);
    assert.equal(actual.firstError, name);
    assert.equal(actual.revertData, data);
  }
  const failure = c5RefusalError(new Error("RPC unavailable"));
  assert.equal(failure.reverted, false);
  assert.equal(failure.firstError, null);
  const malformed = makeError("bad revert", "CALL_EXCEPTION", {
    action: "call",
    data: "0x00",
    reason: null,
    transaction: { to: null, data: "0x" },
    invocation: null,
    revert: null,
  });
  assert.equal(c5RefusalError(malformed).firstError, null);
});

await test("C5 refusal requires source ownership/backing, both terminal rounds and protected destination state", () => {
  const valid = snapshot();
  assert.doesNotThrow(assertC5RefusalState.bind(null, valid, terms));
  for (const index of [0, 1]) {
    const changed = snapshot();
    changed.sales[index] = read("getSale", [[terms[index], 2n]]);
    assert.throws(
      assertC5RefusalState.bind(null, changed, terms),
      /absent round 1 and exact BOUND round 2/,
    );
  }
  for (const index of [0, 1, 2]) {
    const changed = snapshot();
    changed.consumption[index] = read("consumed", [index !== 1]);
    assert.throws(assertC5RefusalState.bind(null, changed, terms), /consumption mismatch/);
  }
  const backing = snapshot();
  backing.source.snapshot.backing = 0n;
  assert.throws(assertC5RefusalState.bind(null, backing, terms), /source claim or backing/);
  const owner = snapshot();
  assert(owner.source.snapshot.claim);
  owner.source.snapshot.claim = {
    ...owner.source.snapshot.claim,
    currentBeneficiary: terms[1].seller,
  };
  assert.throws(assertC5RefusalState.bind(null, owner, terms), /source claim or backing/);
  const round = snapshot();
  round.source.snapshot.rounds = [null, null];
  assert.throws(
    assertC5RefusalState.bind(null, round, terms),
    /cancelled round 1 and assigned round 2/,
  );
});

await test("C5 refusal compares raw snapshots and rejects every money-state or proof-consumption change", () => {
  const before = snapshot();
  assert.doesNotThrow(assertC5RefusalUnchanged.bind(null, before, snapshot()));
  for (const field of ["sales", "consumption", "totals", "balances", "credits"] as const) {
    const changed = snapshot();
    const value = changed[field][0];
    assert(value);
    changed[field][0] = { ...value, raw: value.raw + "00" };
    assert.throws(assertC5RefusalUnchanged.bind(null, before, changed), /snapshot changed/);
  }
  const source = snapshot();
  source.source.backingRaw = "0x99";
  assert.throws(assertC5RefusalUnchanged.bind(null, before, source), /snapshot changed/);
  const insolvent = snapshot();
  insolvent.balances[0] = read("totalBound", [0n]);
  assert.throws(assertC5RefusalState.bind(null, insolvent, terms), /accounting mismatch/);
});
