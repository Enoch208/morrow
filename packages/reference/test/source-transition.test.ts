import assert from "node:assert/strict";
import test from "node:test";
import { assertSourceTransition } from "../src/source-transition.ts";
import { string } from "../src/evidence-files.ts";
import {
  manifest,
  terms,
  seller,
  buyer,
  deadline,
  maturity,
  claim,
  round,
  reserved,
} from "./source-fixture.ts";

await test("T59 source creation and reservation preserve exact backed claim and canonical round", () => {
  assert.doesNotThrow(() => {
    assertSourceTransition(
      "create",
      string(terms.feeRecipient),
      deadline - 1n,
      manifest,
      { claim: null, round: null },
      { claim, round: null },
      claim.referenceHash,
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "create",
      seller,
      deadline - 1n,
      manifest,
      { claim: null, round: null },
      { claim, round: null },
      claim.referenceHash,
    );
  });
  assert.doesNotThrow(() => {
    assertSourceTransition(
      "reserve",
      seller,
      deadline - 1n,
      manifest,
      { claim, round: null },
      { claim: reserved, round },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "reserve",
      seller,
      deadline,
      manifest,
      { claim, round: null },
      { claim: reserved, round },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "reserve",
      seller,
      deadline - 1n,
      manifest,
      { claim, round: null },
      { claim: { ...reserved, latestRound: 2n }, round },
    );
  });
});

await test("T59 assignment changes only ownership/outcome and cannot cross its deadline", () => {
  const assigned = {
    ...reserved,
    activeRound: 0n,
    currentBeneficiary: buyer,
    successfulSale: true,
  };
  const outcome = { ...round, state: 2n };
  assert.doesNotThrow(() => {
    assertSourceTransition(
      "assign",
      seller,
      deadline - 1n,
      manifest,
      { claim: reserved, round },
      { claim: assigned, round: outcome },
    );
  });
  for (const changed of [
    { currentBeneficiary: seller },
    { referenceHash: manifest.identity.termsHash },
    { face: 1n },
    { activeRound: 1n },
    { redeemed: true },
  ])
    assert.throws(() => {
      assertSourceTransition(
        "assign",
        seller,
        deadline - 1n,
        manifest,
        { claim: reserved, round },
        { claim: { ...assigned, ...changed }, round: outcome },
      );
    });
  assert.throws(() => {
    assertSourceTransition(
      "assign",
      seller,
      deadline,
      manifest,
      { claim: reserved, round },
      { claim: assigned, round: outcome },
    );
  });
});

await test("T59 cancellation preserves seller ownership and cannot overwrite assignment", () => {
  const cancelled = { ...reserved, activeRound: 0n };
  const outcome = { ...round, state: 3n };
  assert.doesNotThrow(() => {
    assertSourceTransition(
      "cancel",
      buyer,
      deadline,
      manifest,
      { claim: reserved, round },
      { claim: cancelled, round: outcome },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "cancel",
      buyer,
      deadline - 1n,
      manifest,
      { claim: reserved, round },
      { claim: cancelled, round: outcome },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "cancel",
      buyer,
      deadline,
      manifest,
      { claim: reserved, round: { ...round, state: 2n } },
      { claim: cancelled, round: outcome },
    );
  });
});

await test("T59 maturity redemption preserves permanent round and all immutable claim fields", () => {
  const assigned = {
    ...reserved,
    activeRound: 0n,
    currentBeneficiary: buyer,
    successfulSale: true,
  };
  const terminal = { ...round, state: 2n };
  assert.doesNotThrow(() => {
    assertSourceTransition(
      "redeem",
      seller,
      maturity,
      manifest,
      { claim: assigned, round: terminal },
      { claim: { ...assigned, redeemed: true }, round: terminal },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "redeem",
      seller,
      maturity - 1n,
      manifest,
      { claim: assigned, round: terminal },
      { claim: { ...assigned, redeemed: true }, round: terminal },
    );
  });
  assert.throws(() => {
    assertSourceTransition(
      "redeem",
      seller,
      maturity,
      manifest,
      { claim: assigned, round: terminal },
      { claim: { ...assigned, redeemed: true }, round: null },
    );
  });
});
