import assert from "node:assert/strict";
import test from "node:test";
import { ZeroHash } from "ethers";
import { c5Terms } from "../src/c5-config.ts";
import { requireC5Action, validateC5Call } from "../src/c5-call-policy.ts";

await test("C5 approval permits only fixed actors, amounts, spenders, rounds and deadlines", () => {
  const terms = c5Terms(4n, 1n);
  assert.doesNotThrow(() =>
    validateC5Call(
      "c5-create",
      "PAYER",
      "vault",
      "createClaim",
      [terms.sourceToken, 10000000n, terms.seller, terms.maturity, ZeroHash],
      0n,
    ),
  );
  assert.doesNotThrow(() =>
    validateC5Call("c5-r1-reserve", "SELLER", "vault", "reserveSale", [4n, terms], 4n),
  );
  for (const patch of [
    { maturity: terms.maturity + 1n },
    { round: 2n },
    { grossPurchasePriceRaw: 1n },
    { buyer: terms.seller },
  ])
    assert.throws(
      () =>
        validateC5Call(
          "c5-r1-reserve",
          "SELLER",
          "vault",
          "reserveSale",
          [4n, { ...terms, ...patch }],
          4n,
        ),
      /calldata/,
    );
  assert.throws(
    () =>
      validateC5Call(
        "c5-approve-source",
        "PAYER",
        "sourceToken",
        "approve",
        [terms.sourceVault, 10000001n],
        0n,
      ),
    /calldata/,
  );
  assert.throws(
    () =>
      validateC5Call(
        "c5-approve-source",
        "BUYER",
        "sourceToken",
        "approve",
        [terms.sourceVault, 10000000n],
        0n,
      ),
    /actor/,
  );
  assert.throws(() => { requireC5Action("c5-r1-fund"); }, /Unsupported/);
  assert.throws(() => { requireC5Action("c5-r3-reserve"); }, /Unsupported/);
});
