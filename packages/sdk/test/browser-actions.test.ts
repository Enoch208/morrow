import assert from "node:assert/strict";
import test from "node:test";
import { campaignTerms } from "../src/campaign-config.ts";
import {
  assertBrowserTerms,
  assertReservationClaim,
  confirmPreparedWallet,
} from "../src/browser-action-policy.ts";
import type { Claim, PreparedTransaction } from "@morrow/protocol";
import { assertFundingSnapshot, assertSettlementSnapshot } from "../src/browser-market.ts";

const terms = campaignTerms("a", 2n);
const claim: Claim = {
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
  referenceHash: `0x${"00".repeat(32)}`,
};

await test("browser reservation checks live identity and next round before preparing", () => {
  assertBrowserTerms(terms);
  assertReservationClaim(claim, terms, 1789255000n);
  for (const patch of [
    { activeRound: 1n },
    { latestRound: 1n },
    { successfulSale: true },
    { redeemed: true },
    { currentBeneficiary: terms.buyer },
    { sourceFaceValueRaw: 1n },
  ]) {
    assert.throws(() => {
      assertReservationClaim({ ...claim, ...patch }, terms, 1789255000n);
    });
  }
  assert.throws(() => {
    assertReservationClaim(claim, terms, terms.assignBefore);
  });
});

await test("browser action terms refuse deployment substitution and malformed economics", () => {
  for (const patch of [
    { destinationMarket: terms.sourceVault },
    { protocolVersion: 2n },
    { sourceToken: terms.settlementToken },
    { grossPurchasePriceRaw: 0n },
    { feeBps: 101n },
    { fundBefore: terms.assignBefore + 1n },
  ]) {
    assert.throws(() => {
      assertBrowserTerms({ ...terms, ...patch });
    });
  }
});

await test("signing seam rechecks actual account and chain without sending", async () => {
  const prepared: PreparedTransaction = {
    action: "withdraw",
    expectedSigner: terms.seller,
    chainId: 102031n,
    to: terms.destinationMarket,
    data: "0x3ccfd60b",
    checkedAt: new Date().toISOString(),
    checkedBlock: 1,
    checkedBlockHash: `0x${"11".repeat(32)}`,
  };
  const methods: string[] = [];
  const provider = {
    request: ({ method }: { method: string }) => {
      methods.push(method);
      return Promise.resolve(method === "eth_chainId" ? "0x18e8f" : [terms.seller]);
    },
  };
  await confirmPreparedWallet(provider, prepared);
  assert.deepEqual(methods.sort(), ["eth_accounts", "eth_chainId"]);
  await assert.rejects(
    confirmPreparedWallet(provider, { ...prepared, checkedAt: "2000-01-01T00:00:00.000Z" }),
    /expired/,
  );
  await assert.rejects(
    confirmPreparedWallet(provider, { ...prepared, validBefore: 1n }),
    /expired/,
  );
  await assert.rejects(
    confirmPreparedWallet({ request: () => Promise.resolve("0xaa36a7") }, prepared),
  );
  await assert.rejects(
    confirmPreparedWallet(
      {
        request: ({ method }) =>
          Promise.resolve(method === "eth_chainId" ? "0x18e8f" : [terms.buyer]),
      },
      prepared,
    ),
  );
});

await test("funding rejects a funded sale, changed allowance, or insufficient buyer capital", () => {
  const snapshot = {
    state: 0n,
    totalBound: 0n,
    allowance: terms.grossPurchasePriceRaw,
    buyerBalance: terms.grossPurchasePriceRaw,
  };
  assertFundingSnapshot(snapshot, terms);
  for (const patch of [
    { state: 1n },
    { allowance: terms.grossPurchasePriceRaw + 1n },
    { buyerBalance: terms.grossPurchasePriceRaw - 1n },
  ])
    assert.throws(() => {
      assertFundingSnapshot({ ...snapshot, ...patch }, terms);
    });
});

await test("settlement eligibility has no maturity or proof-arrival deadline", () => {
  const snapshot = {
    state: 1n,
    totalBound: terms.grossPurchasePriceRaw,
    allowance: 0n,
    buyerBalance: 0n,
  };
  assertSettlementSnapshot(snapshot, terms);
  for (const patch of [{ state: 0n }, { state: 2n }, { state: 3n }, { totalBound: 0n }])
    assert.throws(() => {
      assertSettlementSnapshot({ ...snapshot, ...patch }, terms);
    });
});
