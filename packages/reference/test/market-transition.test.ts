import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateManifest } from "../src/manifest-validation.ts";
import { assertMarketTransition } from "../src/market-transition.ts";
import type { MarketTransitionState } from "../src/market-transition.ts";
import { string } from "../src/evidence-files.ts";

const manifest = validateManifest(
  JSON.parse(
    readFileSync(
      new URL("../../../evidence/manifests/a-1789279123015.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
const seller = string(manifest.terms.seller);
const buyer = string(manifest.terms.buyer);
const fee = string(manifest.terms.feeRecipient);
const key = manifest.proofs.find((proof) => proof.decodedEvent.name === "SaleAssigned")?.eventKey;
assert.ok(key);
const before: MarketTransitionState = {
  saleState: 1n,
  encodedTerms: manifest.identity.encodedTerms,
  bound: 9410000000n,
  credits: 0n,
  liabilities: 9410000000n,
  balance: 9410000000n,
  actorCredits: { [seller]: 0n, [buyer]: 0n, [fee]: 0n },
  consumed: { [key]: false },
};
const after: MarketTransitionState = {
  ...before,
  saleState: 2n,
  bound: 0n,
  credits: 9410000000n,
  actorCredits: { [seller]: 9362950000n, [buyer]: 0n, [fee]: 47050000n },
  consumed: { [key]: true },
};

await test("T59 historical assignment requires exact state, consumption and credit allocation", () => {
  assert.doesNotThrow(() => {
    assertMarketTransition("settle", seller, manifest, before, after, key);
  });
  for (const change of [
    { saleState: 3n },
    { bound: 1n },
    { balance: 0n },
    { encodedTerms: null },
    { consumed: { [key]: false } },
    { actorCredits: { [seller]: 9410000000n, [buyer]: 0n, [fee]: 0n } },
  ])
    assert.throws(() => {
      assertMarketTransition("settle", seller, manifest, before, { ...after, ...change }, key);
    });
  assert.throws(() => {
    assertMarketTransition("settle", seller, manifest, { ...before, saleState: 3n }, after, key);
  });
});

await test("T59 withdrawal zeroes only its recipient and preserves the permanent sale", () => {
  const withdrawn = {
    ...after,
    credits: 47050000n,
    liabilities: 47050000n,
    balance: 47050000n,
    actorCredits: { [seller]: 0n, [buyer]: 0n, [fee]: 47050000n },
  };
  assert.doesNotThrow(() => {
    assertMarketTransition("withdraw", seller, manifest, after, withdrawn, null);
  });
  assert.throws(() => {
    assertMarketTransition("withdraw", buyer, manifest, after, withdrawn, null);
  });
  assert.throws(() => {
    assertMarketTransition(
      "withdraw",
      seller,
      manifest,
      after,
      { ...withdrawn, saleState: 0n },
      null,
    );
  });
  assert.throws(() => {
    assertMarketTransition(
      "withdraw",
      seller,
      manifest,
      after,
      { ...withdrawn, consumed: { [key]: false } },
      null,
    );
  });
});

await test("T59 funding is ABSENT directly to BOUND and never creates spendable credits", () => {
  const empty = {
    ...before,
    saleState: 0n,
    encodedTerms: null,
    bound: 0n,
    credits: 0n,
    liabilities: 0n,
    balance: 0n,
  };
  const funded = { ...before, consumed: { [key]: true } };
  assert.doesNotThrow(() => {
    assertMarketTransition("fund", buyer, manifest, empty, funded, key);
  });
  assert.throws(() => {
    assertMarketTransition("fund", buyer, manifest, before, funded, key);
  });
  assert.throws(() => {
    assertMarketTransition("fund", seller, manifest, empty, funded, key);
  });
  assert.throws(() => {
    assertMarketTransition(
      "fund",
      buyer,
      manifest,
      empty,
      { ...funded, actorCredits: { [seller]: 0n, [buyer]: 9410000000n, [fee]: 0n } },
      key,
    );
  });
});

await test("T59 cancellation returns the full price to buyer with no seller or fee credit", () => {
  const cancelled = {
    ...after,
    saleState: 3n,
    actorCredits: { [seller]: 0n, [buyer]: 9410000000n, [fee]: 0n },
  };
  assert.doesNotThrow(() => {
    assertMarketTransition("refund", seller, manifest, before, cancelled, key);
  });
  assert.throws(() => {
    assertMarketTransition(
      "refund",
      seller,
      manifest,
      before,
      { ...cancelled, actorCredits: { [seller]: 0n, [buyer]: 9362950000n, [fee]: 47050000n } },
      key,
    );
  });
  assert.throws(() => {
    assertMarketTransition("refund", seller, manifest, before, cancelled, null);
  });
});

await test("T59 unchanged hidden actor credit cannot bypass total-credit coverage", () => {
  assert.throws(() => {
    assertMarketTransition(
      "settle",
      seller,
      manifest,
      { ...before, actorCredits: { ...before.actorCredits, [fee]: 1n } },
      { ...after, actorCredits: { ...after.actorCredits, [fee]: 47050001n } },
      key,
    );
  });
});
