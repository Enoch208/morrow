import assert from "node:assert/strict";
import test from "node:test";
import { ZeroHash } from "ethers";
import { c5Actors, c5ReferenceTerms } from "../src/c5-policy.ts";
import { referenceIdentity } from "../src/index.ts";
import { assertC5SourceHistory } from "../src/c5-source-check.ts";
import { assertC5MarketHistory } from "../src/c5-market-check.ts";
import { applicationPins } from "../src/manifest-chain.ts";

type Source = Parameters<typeof assertC5SourceHistory>[3];
const first = referenceIdentity(c5ReferenceTerms("4", "1"));
const second = referenceIdentity(c5ReferenceTerms("4", "2"));
const source: Source = {
  blockNumber: 100,
  blockHash: ZeroHash,
  timestamp: 1789295400n,
  claim: {
    token: applicationPins.sourceToken.address,
    face: 10000000n,
    maturity: 1789306200n,
    originalBeneficiary: c5Actors.seller,
    currentBeneficiary: c5Actors.seller,
    activeRound: 0n,
    latestRound: 1n,
    successfulSale: false,
    redeemed: false,
    referenceHash: ZeroHash,
  },
  rounds: [
    {
      state: 3n,
      encodedTerms: first.encodedTerms,
      saleId: first.saleId,
      termsHash: first.termsHash,
    },
    null,
  ],
  backing: 10000000n,
  balance: 10000000n,
  nextClaimId: 5n,
  raw: { claim: "0x", rounds: ["0x", "0x"], backing: "0x", nextClaimId: "0x", balance: "0x" },
};

await test("C5 independent source round-2 transition retains old cancellation and exact beneficiary/backing", () => {
  assert.ok(source.claim);
  const after: Source = {
    ...source,
    blockNumber: 101,
    timestamp: 1789295460n,
    claim: { ...source.claim, activeRound: 2n, latestRound: 2n },
    rounds: [
      source.rounds[0],
      {
        state: 1n,
        encodedTerms: second.encodedTerms,
        saleId: second.saleId,
        termsHash: second.termsHash,
      },
    ],
  };
  assert.doesNotThrow(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.seller, source, after);
  });
  assert.ok(after.claim);
  const afterClaim = after.claim;
  assert.throws(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.seller, source, {
      ...after,
      claim: { ...afterClaim, currentBeneficiary: c5Actors.buyer },
    });
  });
  assert.throws(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.seller, source, { ...after, backing: 0n });
  });
  assert.throws(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.seller, source, {
      ...after,
      rounds: [null, after.rounds[1]],
    });
  });
  assert.throws(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.buyer, source, after);
  });
  assert.throws(() => {
    assertC5SourceHistory("c5-r2-reserve", "4", c5Actors.seller, source, {
      ...after,
      timestamp: 1789296301n,
    });
  });
});

type Market = Parameters<typeof assertC5MarketHistory>[1];
const empty: Market = {
  saleState: 0n,
  bound: 0n,
  credits: 0n,
  liabilities: 0n,
  balance: 0n,
  actorCredits: { [c5Actors.payer]: 0n, [c5Actors.seller]: 0n, [c5Actors.buyer]: 0n },
  actorBalances: { [c5Actors.payer]: 0n, [c5Actors.seller]: 0n, [c5Actors.buyer]: 20000000n },
  consumed: { reservation: false, outcome: false, oldCancellation: false },
};
const funded: Market = {
  ...empty,
  saleState: 1n,
  bound: 9410000n,
  liabilities: 9410000n,
  balance: 9410000n,
  actorBalances: { ...empty.actorBalances, [c5Actors.buyer]: 10590000n },
  consumed: { ...empty.consumed, reservation: true },
};
const assigned: Market = {
  ...funded,
  saleState: 2n,
  bound: 0n,
  credits: 9410000n,
  actorCredits: { ...funded.actorCredits, [c5Actors.payer]: 47050n, [c5Actors.seller]: 9362950n },
  consumed: { ...funded.consumed, outcome: true },
};

await test("C5 independent market funding and assignment preserve exact allocations and replay identities", () => {
  assert.doesNotThrow(() => {
    assertC5MarketHistory("c5-r2-fund", empty, funded, "reservation");
  });
  assert.doesNotThrow(() => {
    assertC5MarketHistory("c5-r2-settle", funded, assigned, "outcome");
  });
  for (const key of ["bound", "credits", "liabilities", "balance"] as const)
    assert.throws(() => {
      assertC5MarketHistory(
        "c5-r2-settle",
        funded,
        { ...assigned, [key]: assigned[key] + 1n },
        "outcome",
      );
    });
  assert.throws(() => {
    assertC5MarketHistory(
      "c5-r2-settle",
      { ...funded, consumed: { ...funded.consumed, outcome: true } },
      assigned,
      "outcome",
    );
  });
  assert.throws(() => {
    assertC5MarketHistory(
      "c5-r2-settle",
      funded,
      { ...assigned, consumed: { ...assigned.consumed, oldCancellation: true } },
      "outcome",
    );
  });
  assert.throws(() => {
    assertC5MarketHistory("c5-r2-settle", funded, assigned, null);
  });
});

await test("C5 independent refunds have no fee and withdrawals pay only exact entitled amounts", () => {
  const cancelled = {
    ...funded,
    saleState: 3n,
    bound: 0n,
    credits: 9410000n,
    actorCredits: { ...funded.actorCredits, [c5Actors.buyer]: 9410000n },
    consumed: { ...funded.consumed, outcome: true },
  };
  assert.doesNotThrow(() => {
    assertC5MarketHistory("c5-r2-refund", funded, cancelled, "outcome");
  });
  assert.throws(() => {
    assertC5MarketHistory(
      "c5-r2-refund",
      funded,
      { ...cancelled, actorCredits: { ...cancelled.actorCredits, [c5Actors.payer]: 1n } },
      "outcome",
    );
  });
  const paid = {
    ...assigned,
    credits: 47050n,
    liabilities: 47050n,
    balance: 47050n,
    actorCredits: { ...assigned.actorCredits, [c5Actors.seller]: 0n },
    actorBalances: { ...assigned.actorBalances, [c5Actors.seller]: 9362950n },
  };
  assert.doesNotThrow(() => {
    assertC5MarketHistory("c5-withdraw-seller", assigned, paid, null);
  });
  const redirected: Market = { ...paid, actorBalances: { ...paid.actorBalances } };
  redirected.actorBalances[c5Actors.seller] = 0n;
  redirected.actorBalances[c5Actors.buyer] = 19952950n;
  assert.throws(() => {
    assertC5MarketHistory("c5-withdraw-seller", assigned, redirected, null);
  });
  assert.throws(() => {
    assertC5MarketHistory("c5-withdraw-seller", paid, paid, null);
  });
});
