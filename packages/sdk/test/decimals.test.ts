import assert from "node:assert/strict";
import test from "node:test";
import type { SaleTerms } from "@morrow/protocol";
import { quoteEconomics, saleIdentity } from "../src/canonical.ts";

const sourceFaceValueRaw = 10_000n * 1_000_000n;
const grossPurchasePriceRaw = 9410n * 10n ** 18n;

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
  sourceFaceValueRaw,
  maturity: 1800000000n,
  settlementToken: "0x0000000000000000000000000000000000001006",
  grossPurchasePriceRaw,
  feeBps: 50n,
  feeRecipient: "0x0000000000000000000000000000000000001007",
  fundBefore: 1799990000n,
  assignBefore: 1799991000n,
};

await test("T52 source face and destination price stay distinct raw integer units", () => {
  assert.notEqual(sourceFaceValueRaw, grossPurchasePriceRaw);
  const economics = quoteEconomics(grossPurchasePriceRaw, 50n);
  assert.equal(economics.grossPurchasePriceRaw, grossPurchasePriceRaw);
  assert.equal(economics.feeRaw, (grossPurchasePriceRaw * 50n) / 10000n);
  assert.notEqual(economics.sellerNetRaw, sourceFaceValueRaw);
  assert.equal(saleIdentity(terms).saleId, saleIdentity({ ...terms, sourceFaceValueRaw }).saleId);
  assert.notEqual(
    saleIdentity(terms).saleId,
    saleIdentity({ ...terms, sourceFaceValueRaw: grossPurchasePriceRaw }).saleId,
  );
});
