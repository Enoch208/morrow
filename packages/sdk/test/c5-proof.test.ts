import assert from "node:assert/strict";
import test from "node:test";
import { AbiCoder, JsonRpcProvider, TransactionReceipt, ZeroHash, keccak256 } from "ethers";
import type { LogParams } from "ethers";
import type { ProofEnvelope, SaleTerms } from "@morrow/protocol";
import { c5Terms } from "../src/c5-config.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import { encodeTerms, saleIdentity } from "../src/canonical.ts";
import { decodedHash } from "../src/decoded-state.ts";
import { validateC5Proof } from "../src/c5-proof-validation.ts";
import type { C5ProofEvent } from "../src/c5-proof-validation.ts";

const coder = AbiCoder.defaultAbiCoder();
const provider = new JsonRpcProvider();
const receiptTypes = ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"];
const bloom = "0x" + "00".repeat(256);
const hash = keccak256("0xc5");

function fixture(
  round: 1n | 2n,
  event: C5ProofEvent,
  changed: {
    logTerms?: SaleTerms;
    duplicate?: boolean;
    wrongEmitter?: boolean;
    badProofLog?: boolean;
    failedReceipt?: boolean;
    wrongCall?: boolean;
    badGas?: boolean;
  } = {},
) {
  const terms = c5Terms(4n, round);
  const logTerms = changed.logTerms ?? terms;
  const identity = saleIdentity(logTerms);
  const name =
    event === "reserve" ? "SaleReserved" : event === "assign" ? "SaleAssigned" : "SaleCancelled";
  const fragment = contractInterfaces.vault.getEvent(name);
  assert(fragment);
  const fields = [identity.saleId, terms.claimId, logTerms.round, identity.termsHash];
  const encoded = contractInterfaces.vault.encodeEventLog(
    fragment,
    event === "reserve" ? [...fields, encodeTerms(logTerms)] : fields,
  );
  const base = {
    transactionHash: hash,
    blockHash: hash,
    blockNumber: 7,
    transactionIndex: 2,
    removed: false,
  };
  const log: LogParams = {
    ...base,
    ...encoded,
    address: changed.wrongEmitter ? terms.sourceToken : terms.sourceVault,
    index: 9,
  };
  const logs = [
    { ...base, address: terms.sourceToken, topics: [ZeroHash], data: "0x", index: 8 },
    log,
  ];
  if (changed.duplicate) logs.push({ ...log, index: 10 });
  const receipt = new TransactionReceipt(
    {
      to: terms.sourceVault,
      from: terms.seller,
      contractAddress: null,
      hash,
      index: 2,
      blockHash: hash,
      blockNumber: 7,
      logsBloom: bloom,
      logs,
      gasUsed: 1n,
      cumulativeGasUsed: 1n,
      gasPrice: 1n,
      type: 2,
      status: changed.failedReceipt ? 0 : 1,
      root: null,
    },
    provider,
  );
  const method =
    event === "reserve" ? "reserveSale" : event === "assign" ? "assignSale" : "cancelExpiredSale";
  const args =
    event === "reserve"
      ? [terms.claimId, terms]
      : event === "assign"
        ? [terms.claimId, terms.round, saleIdentity(terms).termsHash]
        : [terms.claimId, terms.round];
  const calldata = contractInterfaces.vault.encodeFunctionData(method, args);
  const common = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [
      0n,
      100000n,
      terms.seller,
      false,
      terms.sourceVault,
      0n,
      changed.wrongCall ? "0x00" : calldata,
    ],
  );
  const specific = coder.encode(
    ["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
    [11155111n, 1n, 1n, [], 0n, ZeroHash, ZeroHash],
  );
  const encodedReceipt = coder.encode(receiptTypes, [
    changed.failedReceipt ? 0 : 1,
    changed.badGas ? 2n : 1n,
    logs.map((entry) => [entry.address, entry.topics, changed.badProofLog ? "0x00" : entry.data]),
    bloom,
  ]);
  const proof: ProofEnvelope = {
    chainKey: 1n,
    blockHeight: 7n,
    encodedTransaction: coder.encode(
      ["uint8", "bytes[]"],
      [2, [common, specific, encodedReceipt]],
    ) as `0x${string}`,
    merkleProof: { root: decodedHash(ZeroHash), siblings: [] },
    continuityProof: { lowerEndpointDigest: decodedHash(ZeroHash), roots: [] },
  };
  return { proof, receipt, terms, event };
}

await test("C5 exact authenticated transaction and full receipt bind both rounds and all events", () => {
  for (const round of [1n, 2n] as const)
    for (const event of ["reserve", "assign", "cancel"] as const) {
      const f = fixture(round, event);
      const checked = validateC5Proof(f.proof, f.receipt, f.terms, event, 2n);
      assert.deepEqual(checked.identity, saleIdentity(f.terms));
      assert.equal(checked.logIndex, 1);
      assert.equal(
        checked.eventKey,
        keccak256(coder.encode(["uint64", "uint64", "uint64", "uint256"], [1n, 7n, 2n, 1n])),
      );
    }
});

await test("T21 C5 malformed envelopes and wrong native coordinates fail before funding", () => {
  const f = fixture(1n, "reserve");
  for (const proof of [
    { ...f.proof, encodedTransaction: "0x00" as const },
    { ...f.proof, chainKey: 11155111n },
    { ...f.proof, blockHeight: 8n },
  ])
    assert.throws(() => validateC5Proof(proof, f.receipt, f.terms, f.event, 2n));
  assert.throws(
    () => validateC5Proof(f.proof, f.receipt, f.terms, f.event, 3n),
    /coordinates mismatch/,
  );
});

await test("T31 C5 proof-covered logs cannot substitute price, buyer, claim or round", () => {
  const original = c5Terms(4n, 1n);
  for (const logTerms of [
    { ...original, grossPurchasePriceRaw: 1n },
    { ...original, buyer: original.seller },
    { ...original, claimId: 5n },
    c5Terms(4n, 2n),
  ]) {
    const f = fixture(1n, "reserve", { logTerms });
    assert.throws(
      () => validateC5Proof(f.proof, f.receipt, f.terms, f.event, 2n),
      /event identity or canonical terms mismatch/,
    );
  }
  const cancellation = fixture(1n, "cancel");
  assert.throws(
    () => validateC5Proof(cancellation.proof, cancellation.receipt, c5Terms(4n, 2n), "cancel", 2n),
    /source call mismatch/,
  );
});

await test("T24–T29 C5 wrong emitter, duplicated events and inconsistent receipts fail closed", () => {
  for (const changed of [
    { wrongEmitter: true },
    { duplicate: true },
    { badProofLog: true },
    { failedReceipt: true },
    { wrongCall: true },
    { badGas: true },
  ]) {
    const f = fixture(2n, "assign", changed);
    assert.throws(() => validateC5Proof(f.proof, f.receipt, f.terms, f.event, 2n));
  }
});
provider.destroy();
