import assert from "node:assert/strict";
import test from "node:test";
import { checkedArtifact, record, string } from "../src/evidence-files.ts";
import { referenceEconomics } from "../src/index.ts";
import { applicationPins } from "../src/manifest-chain.ts";
import { SubmissionUnverified } from "../src/submission-report.ts";
import { EvidenceError } from "../src/checker-rpc.ts";
import { manifest, claim, round, buyer } from "./source-fixture.ts";
import {
  assertSubmissionClaimSource,
  assertSubmissionClaimMarket,
  submissionPayment,
} from "../src/submission-claim.ts";
import type { SubmissionVerification } from "../src/submission-claim.ts";

const source = {
  claim: {
    ...claim,
    currentBeneficiary: buyer,
    latestRound: 1n,
    successfulSale: true,
    redeemed: true,
  },
  round: { ...round, state: 2n },
};
const market = {
  saleState: 2n,
  encodedTerms: manifest.identity.encodedTerms,
  bound: 11n,
  credits: 7n,
  liabilities: 18n,
  balance: 23n,
  actorCredits: {},
  consumed: {},
};
const economics = referenceEconomics(
  string(manifest.terms.grossPurchasePriceRaw),
  string(manifest.terms.feeBps),
);
const timeline: unknown = JSON.parse((await checkedArtifact(manifest.timeline)).toString("utf8"));
assert.ok(Array.isArray(timeline));
const rows = timeline.map(record);
function verified(action: "a-fund" | "a-withdraw" | "withdraw-fee"): SubmissionVerification {
  const item = manifest.transactions.find((entry) => entry.action === action);
  assert.ok(item);
  const amount = BigInt(
    action === "a-fund"
      ? economics.grossPurchasePriceRaw
      : action === "a-withdraw"
        ? economics.sellerNetRaw
        : economics.feeRaw,
  );
  const from = string(
    action === "a-fund" ? manifest.terms.buyer : manifest.terms.destinationMarket,
  );
  const to = string(
    action === "a-fund"
      ? manifest.terms.destinationMarket
      : action === "a-withdraw"
        ? manifest.terms.seller
        : manifest.terms.feeRecipient,
  );
  return {
    campaignId: "a",
    saleId: manifest.identity.saleId,
    paymentChecks: [
      {
        transactionHash: item.transactionHash,
        token: applicationPins.settlementToken.address,
        blockHash: item.blockHash,
        blockNumber: item.blockNumber,
        actual: [{ from, to, amount, transactionIndex: 0 }],
        balances: [from, to].map((address) => ({
          address,
          beforeBlockRaw: "0x",
          afterBlockRaw: "0x",
          beforeTransaction: address === from ? amount : 0n,
          afterTransaction: address === to ? amount : 0n,
          blockDelta: 0n,
        })),
        reconstruction: "isolated test input",
      },
    ],
  };
}

await test("submission Claim A source checks bind face, buyer and exact permanent round identity", () => {
  assert.equal(assertSubmissionClaimSource(manifest, source).faceRaw, claim.face);
  for (const patch of [
    { face: claim.face + 1n },
    { currentBeneficiary: claim.originalBeneficiary },
    { latestRound: 2n },
    { successfulSale: false },
  ])
    assert.throws(() =>
      assertSubmissionClaimSource(manifest, { ...source, claim: { ...source.claim, ...patch } }),
    );
  for (const patch of [
    { termsHash: round.saleId },
    { saleId: round.termsHash },
    { encodedTerms: "0x" },
    { state: 3n },
  ])
    assert.throws(() =>
      assertSubmissionClaimSource(manifest, { ...source, round: { ...source.round, ...patch } }),
    );
});

await test("submission market accounts include other sales and donations without hiding deficits", () => {
  assert.equal(assertSubmissionClaimMarket(manifest, market).liabilities, 18n);
  for (const patch of [
    { liabilities: 17n },
    { balance: 17n },
    { encodedTerms: "0x" },
    { saleState: 1n },
  ])
    assert.throws(() => assertSubmissionClaimMarket(manifest, { ...market, ...patch }));
});

await test("submission withdrawals require recorded amounts and verified actual transfers, not formula-only claims", () => {
  for (const action of ["a-withdraw", "withdraw-fee"] as const) {
    const input = verified(action);
    const payment = submissionPayment(manifest, input, rows, action);
    assert.equal(
      payment.amountRaw,
      BigInt(action === "a-withdraw" ? economics.sellerNetRaw : economics.feeRaw),
    );
    const changed = structuredClone(input);
    const first = changed.paymentChecks[0];
    assert.ok(first?.actual[0]);
    first.actual[0] = { ...first.actual[0], amount: first.actual[0].amount + 1n };
    assert.throws(() => submissionPayment(manifest, changed, rows, action));
    const wrongRows = rows.map((row) =>
      row.action === action && row.state === "withdrawal-verified" ? { ...row, amount: "1" } : row,
    );
    assert.throws(() => submissionPayment(manifest, input, wrongRows, action));
    assert.throws(() =>
      submissionPayment(
        manifest,
        input,
        rows.filter((row) => row.action !== action),
        action,
      ),
    );
    assert.throws(() =>
      submissionPayment(
        manifest,
        input,
        [...rows, ...rows.filter((row) => row.action === action && row.state === "mined")],
        action,
      ),
    );
  }
});

await test("submission funding uses mined gross transfer and rejects mismatched campaign, token, block and balance effects", () => {
  const input = verified("a-fund");
  assert.equal(
    submissionPayment(manifest, input, rows, "a-fund").amountRaw,
    BigInt(economics.grossPurchasePriceRaw),
  );
  assert.throws(() =>
    submissionPayment(manifest, { ...input, saleId: round.termsHash }, rows, "a-fund"),
  );
  for (const field of ["token", "blockHash"] as const) {
    const changed = structuredClone(input);
    const first = changed.paymentChecks[0];
    assert.ok(first);
    first[field] = applicationPins.sourceToken.address;
    assert.throws(() => submissionPayment(manifest, changed, rows, "a-fund"));
  }
  const changed = structuredClone(input);
  const balance = changed.paymentChecks[0]?.balances[0];
  assert.ok(balance);
  balance.afterTransaction++;
  assert.throws(() => submissionPayment(manifest, changed, rows, "a-fund"));
});

await test("submission absence stays UNVERIFIED while contradictory duplicate evidence fails", () => {
  assert.throws(
    () => assertSubmissionClaimSource(manifest, { claim: null, round: null }),
    SubmissionUnverified,
  );
  const input = verified("a-fund");
  assert.throws(
    () => submissionPayment(manifest, { ...input, paymentChecks: [] }, rows, "a-fund"),
    SubmissionUnverified,
  );
  assert.throws(
    () =>
      submissionPayment(
        manifest,
        { ...input, paymentChecks: [...input.paymentChecks, ...input.paymentChecks] },
        rows,
        "a-fund",
      ),
    EvidenceError,
  );
});
