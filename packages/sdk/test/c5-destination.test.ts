import assert from "node:assert/strict";
import test from "node:test";
import { campaignTerms } from "../src/campaign-config.ts";
import { quoteEconomics } from "../src/canonical.ts";
import {
  assertC5Accounting,
  assertC5Admission,
  assertC5Withdrawal,
} from "../src/c5-destination-checks.ts";

const terms = { ...campaignTerms("a", 4n), round: 2n, grossPurchasePriceRaw: 9410000n };
const empty = {
  bound: 0n,
  credits: 0n,
  liabilities: 0n,
  balance: 0n,
  payerBalance: 0n,
  sellerBalance: 0n,
  buyerBalance: 20000000n,
  payerCredit: 0n,
  sellerCredit: 0n,
  buyerCredit: 0n,
};
const price = terms.grossPurchasePriceRaw;
const funded = {
  ...empty,
  bound: price,
  liabilities: price,
  balance: price,
  buyerBalance: empty.buyerBalance - price,
};

await test("C5 T50 withdrawals pay only the entitled actor and conserve every balance", () => {
  for (const recipient of ["seller", "fee", "buyer"] as const) {
    const creditKey =
      recipient === "seller" ? "sellerCredit" : recipient === "fee" ? "payerCredit" : "buyerCredit";
    const balanceKey =
      recipient === "seller"
        ? "sellerBalance"
        : recipient === "fee"
          ? "payerBalance"
          : "buyerBalance";
    const before = {
      ...empty,
      credits: price,
      liabilities: price,
      balance: price,
      [creditKey]: price,
    };
    const after = { ...empty, [balanceKey]: empty[balanceKey] + price };
    assert.doesNotThrow(() => {
      assertC5Withdrawal(before, after, recipient, price);
    });
    for (const field of Object.keys(after) as (keyof typeof after)[])
      assert.throws(() => {
        assertC5Withdrawal(before, { ...after, [field]: after[field] + 1n }, recipient, price);
      });
    assert.throws(() => {
      assertC5Withdrawal(before, after, recipient, price - 1n);
    });
    assert.throws(() => {
      assertC5Withdrawal(after, after, recipient, price);
    });
  }
});

await test("C5 T20 funding moves exact buyer capital once and preserves unrelated accounts", () => {
  assert.doesNotThrow(() => {
    assertC5Accounting(empty, funded, terms, "fund");
  });
  for (const field of Object.keys(funded) as (keyof typeof funded)[]) {
    assert.throws(() => {
      assertC5Accounting(empty, { ...funded, [field]: funded[field] + 1n }, terms, "fund");
    });
  }
});

await test("C5 T37/T38 allocation conserves liability with zero cancellation fee", () => {
  const { feeRaw, sellerNetRaw } = quoteEconomics(price, terms.feeBps);
  const assigned = {
    ...funded,
    bound: 0n,
    credits: price,
    payerCredit: feeRaw,
    sellerCredit: sellerNetRaw,
  };
  const cancelled = { ...funded, bound: 0n, credits: price, buyerCredit: price };
  assert.doesNotThrow(() => {
    assertC5Accounting(funded, assigned, terms, "settle");
  });
  assert.doesNotThrow(() => {
    assertC5Accounting(funded, cancelled, terms, "refund");
  });
  assert.throws(() => {
    assertC5Accounting(funded, { ...cancelled, payerCredit: 1n }, terms, "refund");
  });
  assert.throws(() => {
    assertC5Accounting(funded, cancelled, terms, "settle");
  });
});

await test("C5 admission prohibits first-round funding and enforces fresh buffered deadlines", () => {
  const now = terms.fundBefore - 601n;
  assert.doesNotThrow(() => {
    assertC5Admission(terms, now, now);
  });
  assert.throws(() => {
    assertC5Admission({ ...terms, round: 1n }, now, now);
  }, /round 2/);
  assert.throws(() => {
    assertC5Admission(terms, terms.fundBefore - 600n, terms.fundBefore - 600n);
  }, /buffer/);
  assert.throws(() => {
    assertC5Admission(terms, now - 121n, now);
  }, /timestamp/);
  assert.throws(() => {
    assertC5Admission(terms, now + 31n, now);
  }, /timestamp/);
});
