import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Interface, ZeroHash, keccak256, toBeHex, zeroPadValue } from "ethers";
import { campaignActors, campaignContracts } from "../src/campaign-config.ts";
import { livePreflightReaders } from "../src/preflight-rpc.ts";
import { prepareAssignment } from "../src/preflight.ts";
import {
  PreflightRpcFixture,
  terms,
  identity,
  sourceHash,
  destinationHash,
  fixtureTime,
} from "./preflight-rpc-fixture.ts";
import type { FundingPatch } from "./preflight-rpc-fixture.ts";

function artifact(name: string, hash: string, values: readonly string[]) {
  const value: unknown = JSON.parse(
    readFileSync(
      new URL(`../../../deployments/custody/${name}-${hash}.artifact.json`, import.meta.url),
      "utf8",
    ),
  );
  assert(value && typeof value === "object" && "abi" in value && "deployedBytecode" in value);
  const runtime = value.deployedBytecode;
  assert(runtime && typeof runtime === "object");
  assert("object" in runtime && "immutableReferences" in runtime);
  assert(typeof runtime.object === "string");
  let code = runtime.object;
  const references = runtime.immutableReferences;
  assert(references && typeof references === "object");
  Object.values(references).forEach((entries: unknown, index) => {
    assert(Array.isArray(entries));
    const replacement = values[index];
    assert(replacement);
    for (const entry of entries as unknown[]) {
      assert(entry && typeof entry === "object" && "start" in entry && "length" in entry);
      assert(typeof entry.start === "number");
      assert.equal(entry.length, 32);
      const start = 2 + entry.start * 2;
      code = code.slice(0, start) + zeroPadValue(replacement, 32).slice(2) + code.slice(start + 64);
    }
  });
  return { abi: new Interface(JSON.stringify(value.abi)), code };
}

const token = artifact(
  "MorrowTestToken",
  "48b8723d4e8c6f321cc8749cb66ab72536a31d068816c82cff252e6032e7c66a",
  [toBeHex(6)],
);
const vault = artifact(
  "FundedPaymentVault",
  "9d90679be7fbad0158e10b4867c8de2fec9a3cae28d035dc35499f2f239ddeda",
  [terms.sourceToken],
);
const market = artifact(
  "MorrowMarket",
  "3787b0567476cd277b7663ec2c31f0415ee3899a6a6ce5abb65e83612899de19",
  [
    terms.settlementToken,
    terms.sourceVault,
    terms.sourceToken,
    terms.feeRecipient,
    toBeHex(terms.feeBps),
  ],
);
for (const [entry, pin] of [
  [token, campaignContracts.sourceToken],
  [vault, campaignContracts.vault],
  [market, campaignContracts.market],
] as const)
  assert.equal(keccak256(entry.code), pin.codeHash);
const contracts = {
  [terms.sourceToken]: token,
  [terms.settlementToken]: token,
  [terms.sourceVault]: vault,
  [terms.destinationMarket]: market,
};
const fundingHash = keccak256("0x1234");

function fixture(t: test.TestContext) {
  const source = new PreflightRpcFixture(11155111n, contracts);
  const destination = new PreflightRpcFixture(102031n, contracts);
  t.after(() => {
    source.destroy();
    destination.destroy();
  });
  const readers = livePreflightReaders(source, destination, terms, fundingHash);
  const prepare = () =>
    prepareAssignment(terms, terms.seller, 11155111n, readers, () => fixtureTime);
  return { source, destination, readers, prepare };
}

await test("T53 RPC reader decodes exact sale and finalized funding at pinned blocks", async (t) => {
  const f = fixture(t);
  const source = await f.readers.source();
  const destination = await f.readers.destination();
  assert.deepEqual(f.source.blocks, ["latest", 10]);
  assert.deepEqual(f.destination.blocks, ["finalized", 19, 20]);
  assert.deepEqual(f.destination.receiptHashes, [fundingHash]);
  assert(f.source.reads.length > 0 && f.source.reads.every((read) => read.blockTag === 10));
  assert(
    f.destination.reads.length > 0 && f.destination.reads.every((read) => read.blockTag === 20),
  );
  assert.deepEqual(
    new Set(f.source.reads.filter((read) => read.method === "getCode").map((read) => read.address)),
    new Set([terms.sourceVault, terms.sourceToken]),
  );
  assert.deepEqual(
    new Set(
      f.destination.reads.filter((read) => read.method === "getCode").map((read) => read.address),
    ),
    new Set([terms.destinationMarket, terms.settlementToken]),
  );
  assert.deepEqual(source.terms, terms);
  assert.equal(source.saleId, identity.saleId);
  assert.equal(source.termsHash, identity.termsHash);
  assert.equal(source.blockHash, sourceHash);
  assert.equal(source.vaultBalance, terms.sourceFaceValueRaw);
  assert.deepEqual(destination.terms, terms);
  assert.equal(destination.blockHash, destinationHash);
  assert.equal(destination.state, 1n);
  assert.equal(destination.finalized, true);
  assert.equal(destination.fundingMatches, true);
  assert.equal(destination.marketBalance, terms.grossPurchasePriceRaw);
  assert.equal((await f.prepare()).sellerNetRaw, 9362950000n);
});

await test("T54 changed source or finalized destination snapshot blocks assignment", async (t) => {
  for (const sourceSide of [true, false]) {
    const f = fixture(t);
    (sourceSide ? f.source : f.destination).changedSnapshot = sourceSide ? 10 : 20;
    const chain = sourceSide ? "Source" : "Destination";
    await assert.rejects(f.prepare(), new RegExp(`${chain} snapshot block is not canonical`));
  }
});

await test("T54 RPC reader rejects each unapproved runtime and wrong RPC chain", async (t) => {
  for (const key of ["vault", "sourceToken", "market", "settlementToken"] as const) {
    const f = fixture(t);
    const sourceSide = campaignContracts[key].chainId === 11155111n;
    const provider = sourceSide ? f.source : f.destination;
    provider.wrongRuntime = campaignContracts[key].address;
    await assert.rejects(
      sourceSide ? f.readers.source() : f.readers.destination(),
      /runtime mismatch/,
    );
  }
  for (const sourceSide of [true, false]) {
    const f = fixture(t);
    (sourceSide ? f.source : f.destination).chainId = 1n;
    await assert.rejects(sourceSide ? f.readers.source() : f.readers.destination(), /chain/i);
  }
});

await test("T53 RPC reader requires a successful receipt in its canonical block", async (t) => {
  const reverted = fixture(t);
  reverted.destination.funding = { status: 0 };
  await assert.rejects(reverted.prepare(), /Successful funding receipt unavailable/);
  const missing = fixture(t);
  missing.destination.missingReceipt = true;
  await assert.rejects(missing.prepare(), /Successful funding receipt unavailable/);
  const orphan = fixture(t);
  orphan.destination.funding = { blockHash: ZeroHash };
  await assert.rejects(orphan.prepare(), /not canonical/);
  const unfinalized = fixture(t);
  unfinalized.destination.funding = { blockNumber: 21 };
  await assert.rejects(unfinalized.prepare(), /unfinalized/);
});

await test("T54 receipt mismatches cannot authorize assignment despite a BOUND sale", async (t) => {
  const mismatches: FundingPatch[] = [
    { saleId: ZeroHash },
    { buyer: campaignActors.PAYER },
    { amount: 1n },
    { from: campaignActors.SELLER },
    { to: terms.sourceVault },
    { emitter: terms.sourceVault },
    { duplicate: true },
    { missingEvent: true },
  ];
  for (const patch of mismatches) {
    const f = fixture(t);
    f.destination.funding = patch;
    assert.equal((await f.readers.destination()).fundingMatches, false);
    await assert.rejects(f.prepare(), /mismatched/);
  }
  const malformed = fixture(t);
  malformed.destination.funding = { malformedEvent: true };
  await assert.rejects(malformed.prepare());
});

await test("T54 missing finality and source or destination RPC errors propagate", async (t) => {
  for (const sourceSide of [true, false]) {
    const missing = fixture(t);
    (sourceSide ? missing.source : missing.destination).missingBlock = true;
    await assert.rejects(missing.prepare(), /block unavailable/);
    for (const failure of ["block", "code", "call", "receipt"] as const) {
      if (sourceSide && failure === "receipt") continue;
      const f = fixture(t);
      (sourceSide ? f.source : f.destination).failure = failure;
      await assert.rejects(f.prepare(), new RegExp(`fixture ${failure} RPC failure`));
    }
  }
});
