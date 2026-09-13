import assert from "node:assert/strict";
import test from "node:test";
import type { SaleTerms } from "@morrow/protocol";
import { encodeTerms, saleIdentity, quoteEconomics } from "../src/canonical.ts";
import { referenceIdentity, referenceEconomics } from "@morrow/reference";
import vector from "../../../schemas/vectors/canonical-v1.json" with { type: "json" };

const terms: SaleTerms = {
  protocolVersion: 1n,
  sourceEvmChainId: 11155111n,
  sourceVault: "0x0000000000000000000000000000000000001001",
  claimId: 1n,
  round: 1n,
  destinationEvmChainId: 102031n,
  destinationMarket: "0x0000000000000000000000000000000000001002",
  seller: "0x0000000000000000000000000000000000001003",
  buyer: "0x0000000000000000000000000000000000001004",
  sourceToken: "0x0000000000000000000000000000000000001005",
  sourceFaceValueRaw: 10000000000n,
  maturity: 1800000000n,
  settlementToken: "0x0000000000000000000000000000000000001006",
  grossPurchasePriceRaw: 9410000000n,
  feeBps: 50n,
  feeRecipient: "0x0000000000000000000000000000000000001007",
  fundBefore: 1799990000n,
  assignBefore: 1799991000n,
};

await test("T61 canonical SDK encoding has exactly eighteen words", () => {
  assert.equal(encodeTerms(terms).length, 1154);
  assert.equal(encodeTerms(terms), vector.encodedTerms);
  assert.deepEqual(saleIdentity(terms), {
    claimKey: "0x90cab66b70df98c5d4177767e830f9b1fb61aa5a0112c75fcc6687f7593a6ba8",
    termsHash: "0xc3e9246c15b71d78e4257019a608dce94c17907bd6484469842c066eb9ba505f",
    saleId: "0x10b3c01a6d138f7f93e6bd70b595ae8a06f47df3d9925924df6e391ad92bcee7",
  });
});

await test("T31 every canonical field affects the sale identity", () => {
  const original = saleIdentity(terms);
  for (const name of Object.keys(terms) as (keyof SaleTerms)[]) {
    const value = terms[name];
    const changed = {
      ...terms,
      [name]: typeof value === "bigint" ? value + 1n : "0x000000000000000000000000000000000000bad0",
    };
    assert.notEqual(saleIdentity(changed).saleId, original.saleId, name);
  }
});

await test("T51 gross price, fee and seller net remain distinct exact integers", () => {
  assert.deepEqual(quoteEconomics(9410000000n, 50n), {
    grossPurchasePriceRaw: 9410000000n,
    feeRaw: 47050000n,
    sellerNetRaw: 9362950000n,
  });
  assert.equal(quoteEconomics(1n, 50n).feeRaw, 0n);
  assert.throws(() => quoteEconomics(1n, 101n));
});

await test("T61 SDK ABI encoder matches independent word encoding and economics", () => {
  for (let index = 0n; index < 32n; index++) {
    const sample = {
      ...terms,
      claimId: terms.claimId + index,
      round: terms.round + index,
      grossPurchasePriceRaw: terms.grossPurchasePriceRaw + index,
      feeBps: index * 3n,
    };
    const reference = referenceIdentity(
      Object.fromEntries(Object.entries(sample).map(([name, value]) => [name, value.toString()])),
    );
    assert.equal(encodeTerms(sample), reference.encodedTerms);
    assert.deepEqual(saleIdentity(sample), {
      claimKey: reference.claimKey,
      termsHash: reference.termsHash,
      saleId: reference.saleId,
    });
    const economics = quoteEconomics(sample.grossPurchasePriceRaw, sample.feeBps);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(economics).map(([name, value]) => [name, value.toString()]),
      ),
      referenceEconomics(sample.grossPurchasePriceRaw.toString(), sample.feeBps.toString()),
    );
  }
});
