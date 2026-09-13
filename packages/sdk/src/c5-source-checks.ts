import { ZeroHash } from "ethers";
import type { Claim, SaleTerms } from "@morrow/protocol";
import { c5Terms } from "./c5-config.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export type C5SourceOperation =
  "create" | "reserve1" | "cancel1" | "reserve2" | "cancel2" | "redeem";
export interface C5SourceRound {
  terms: SaleTerms;
  state: bigint;
  saleId: string;
  termsHash: string;
}
export interface C5SourceSnapshot {
  claim: Claim | null;
  rounds: readonly [C5SourceRound | null, C5SourceRound | null];
  backing: bigint;
  allowance: bigint;
  balances: { payer: bigint; seller: bigint; buyer: bigint; vault: bigint };
}

function requireState(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ConfigurationError(`C5 source ${message}`);
}

export { assertC5SourceWindow, assertC5SourceNotSubmitted } from "./c5-source-policy.ts";

function sameRound(actual: C5SourceRound | null, expected: C5SourceRound | null): boolean {
  if (!actual || !expected) return actual === expected;
  return (
    actual.state === expected.state &&
    actual.saleId === expected.saleId &&
    actual.termsHash === expected.termsHash &&
    encodeTerms(actual.terms) === encodeTerms(expected.terms)
  );
}

function expectedRound(terms: SaleTerms, state: bigint): C5SourceRound {
  return { terms, state, ...saleIdentity(terms) };
}

function sameClaim(actual: Claim | null, expected: Claim): void {
  requireState(
    actual !== null &&
      (Object.keys(expected) as (keyof Claim)[]).every((key) => actual[key] === expected[key]),
    "claim identity or state mismatch",
  );
}

export function checkC5SourceSnapshot(snapshot: C5SourceSnapshot, terms: SaleTerms): void {
  const claim = snapshot.claim;
  requireState(claim !== null, "claim missing");
  sameClaim(claim, {
    ...claim,
    claimId: terms.claimId,
    sourceToken: terms.sourceToken,
    sourceFaceValueRaw: terms.sourceFaceValueRaw,
    maturity: terms.maturity,
    originalBeneficiary: terms.seller,
    currentBeneficiary: claim.successfulSale ? terms.buyer : terms.seller,
    referenceHash: ZeroHash as `0x${string}`,
  });
  requireState(claim.latestRound >= 0n && claim.latestRound <= 2n, "unexpected latest round");
  for (const [index, round] of snapshot.rounds.entries()) {
    const id = index === 0 ? 1n : 2n;
    requireState(
      id <= claim.latestRound ? round !== null : round === null,
      "round presence mismatch",
    );
    if (round)
      requireState(
        round.state >= 1n &&
          round.state <= 3n &&
          sameRound(round, expectedRound(c5Terms(terms.claimId, id), round.state)),
        "round commitment mismatch",
      );
  }
  if (claim.latestRound === 2n)
    requireState(snapshot.rounds[0]?.state === 3n, "old cancellation missing");
  requireState(snapshot.rounds[0]?.state !== 2n, "unapproved first-round assignment");
  const active = snapshot.rounds.filter((round) => round?.state === 1n);
  requireState(
    claim.activeRound === 0n
      ? active.length === 0
      : active.length === 1 && claim.activeRound === claim.latestRound,
    "active round mismatch",
  );
  requireState(
    claim.successfulSale === (snapshot.rounds[1]?.state === 2n),
    "assignment flag mismatch",
  );
  requireState(!claim.redeemed || claim.activeRound === 0n, "redeemed active claim");
  requireState(snapshot.balances.vault >= snapshot.backing, "backing insolvent");
  requireState(
    claim.redeemed || snapshot.backing >= claim.sourceFaceValueRaw,
    "claim backing missing",
  );
}

export function checkC5SourceEligibility(
  operation: C5SourceOperation,
  terms: SaleTerms,
  before: C5SourceSnapshot,
): void {
  requireState(
    encodeTerms(terms) === encodeTerms(c5Terms(terms.claimId, terms.round === 2n ? 2n : 1n)),
    "terms differ from approval",
  );
  if (operation === "create") {
    requireState(
      before.allowance === terms.sourceFaceValueRaw &&
        before.balances.payer >= terms.sourceFaceValueRaw,
      "creation allowance or payer balance mismatch",
    );
    requireState(before.balances.vault >= before.backing, "backing insolvent");
    requireState(
      before.claim === null && before.rounds.every((round) => round === null),
      "creation already exists",
    );
    return;
  }
  if (operation !== "redeem")
    requireState(terms.round === (operation.endsWith("2") ? 2n : 1n), "operation round mismatch");
  checkC5SourceSnapshot(before, terms);
  const claim = before.claim;
  requireState(claim !== null && !claim.redeemed, "claim already redeemed");
  if (operation === "redeem") {
    requireState(claim.activeRound === 0n, "redemption has active reservation");
  } else if (operation === "reserve1" || operation === "reserve2") {
    requireState(
      !claim.successfulSale && claim.activeRound === 0n && claim.latestRound === terms.round - 1n,
      "claim not reservable",
    );
  } else {
    requireState(
      !claim.successfulSale &&
        claim.activeRound === terms.round &&
        before.rounds[terms.round === 1n ? 0 : 1]?.state === 1n,
      "round not cancellable",
    );
  }
}

export function checkC5SourceTransition(
  operation: C5SourceOperation,
  terms: SaleTerms,
  before: C5SourceSnapshot,
  after: C5SourceSnapshot,
): void {
  checkC5SourceEligibility(operation, terms, before);
  let expected: Claim;
  const rounds: [C5SourceRound | null, C5SourceRound | null] = [...before.rounds];
  let movement = 0n;
  let recipient: "payer" | "seller" | "buyer" = "payer";
  if (operation === "create") {
    expected = {
      claimId: terms.claimId,
      sourceToken: terms.sourceToken,
      sourceFaceValueRaw: terms.sourceFaceValueRaw,
      maturity: terms.maturity,
      originalBeneficiary: terms.seller,
      currentBeneficiary: terms.seller,
      activeRound: 0n,
      latestRound: 0n,
      successfulSale: false,
      redeemed: false,
      referenceHash: ZeroHash as `0x${string}`,
    };
    movement = terms.sourceFaceValueRaw;
  } else {
    requireState(before.claim !== null, "claim missing");
    expected = { ...before.claim };
    const roundId = operation === "reserve2" || operation === "cancel2" ? 2n : 1n;
    const index = roundId === 1n ? 0 : 1;
    if (operation === "reserve1" || operation === "reserve2") {
      expected = { ...expected, activeRound: roundId, latestRound: roundId };
      rounds[index] = expectedRound(terms, 1n);
    } else if (operation === "cancel1" || operation === "cancel2") {
      expected = { ...expected, activeRound: 0n };
      rounds[index] = expectedRound(terms, 3n);
    } else {
      expected = { ...expected, redeemed: true };
      movement = -terms.sourceFaceValueRaw;
      recipient = expected.successfulSale ? "buyer" : "seller";
    }
  }
  sameClaim(after.claim, expected);
  checkC5SourceSnapshot(after, terms);
  requireState(
    after.rounds.every((round, index) => sameRound(round, rounds[index] ?? null)),
    "terminal round record changed",
  );
  requireState(after.backing === before.backing + movement, "backing delta mismatch");
  requireState(
    after.allowance === (operation === "create" ? 0n : before.allowance),
    "allowance delta mismatch",
  );
  for (const key of ["payer", "seller", "buyer", "vault"] as const) {
    const delta = key === "vault" ? movement : key === recipient ? -movement : 0n;
    requireState(
      after.balances[key] === before.balances[key] + delta,
      `${key} token delta mismatch`,
    );
  }
}
