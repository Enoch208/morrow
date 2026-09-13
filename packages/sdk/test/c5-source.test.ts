import assert from "node:assert/strict";
import test from "node:test";
import { ZeroHash } from "ethers";
import { campaignTerms } from "../src/campaign-config.ts";
import { saleIdentity } from "../src/canonical.ts";
import {
  assertC5SourceWindow,
  assertC5SourceNotSubmitted,
  checkC5SourceTransition,
} from "../src/c5-source-checks.ts";
import type { C5SourceSnapshot } from "../src/c5-source-checks.ts";

const terms = {
  ...campaignTerms("gate", 4n),
  maturity: 1789306200n,
  fundBefore: 1789293600n,
  assignBefore: 1789295400n,
};
const terms2 = {
  ...terms,
  round: 2n,
  fundBefore: 1789299900n,
  assignBefore: 1789301700n,
};
const empty: C5SourceSnapshot = {
  claim: null,
  rounds: [null, null],
  backing: 0n,
  allowance: 10000000n,
  balances: { payer: 100000000n, seller: 0n, buyer: 0n, vault: 0n },
};
const created: C5SourceSnapshot = {
  claim: {
    claimId: 4n,
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
  },
  rounds: [null, null],
  backing: 10000000n,
  allowance: 0n,
  balances: { payer: 90000000n, seller: 0n, buyer: 0n, vault: 10000000n },
};
function claim(snapshot: C5SourceSnapshot) {
  assert(snapshot.claim);
  return snapshot.claim;
}
const reserved1: C5SourceSnapshot = {
  ...created,
  claim: { ...claim(created), activeRound: 1n, latestRound: 1n },
  rounds: [{ terms, state: 1n, ...saleIdentity(terms) }, null],
};
const cancelled1: C5SourceSnapshot = {
  ...reserved1,
  claim: { ...claim(reserved1), activeRound: 0n },
  rounds: [{ terms, state: 3n, ...saleIdentity(terms) }, null],
};
const reserved2: C5SourceSnapshot = {
  ...cancelled1,
  claim: { ...claim(cancelled1), activeRound: 2n, latestRound: 2n },
  rounds: [cancelled1.rounds[0], { terms: terms2, state: 1n, ...saleIdentity(terms2) }],
};

await test("C5 source windows require both clocks and exact fixed boundaries", () => {
  assert.doesNotThrow(() => {
    assertC5SourceWindow("reserve1", 1789290000n, 1789290000n, terms);
  });
  assert.throws(() => {
    assertC5SourceWindow("create", 1789290001n, 1789290000n, terms);
  });
  assert.throws(() => {
    assertC5SourceWindow("reserve2", 1789296300n, 1789296301n, terms2);
  });
  assert.throws(() => {
    assertC5SourceWindow("cancel1", terms.assignBefore - 1n, terms.assignBefore, terms);
  });
  assert.throws(() => {
    assertC5SourceWindow("cancel2", terms2.assignBefore, terms2.assignBefore - 1n, terms2);
  });
  assert.doesNotThrow(() => {
    assertC5SourceWindow("cancel1", terms.assignBefore, terms.assignBefore, terms);
  });
  assert.throws(() => {
    assertC5SourceWindow("redeem", terms.maturity, terms.maturity - 1n, terms);
  });
  assert.doesNotThrow(() => {
    assertC5SourceWindow("redeem", terms.maturity, terms.maturity, terms);
  });
});

await test("C5 source refuses every previous submission even after failure", () => {
  for (const state of ["prepared", "submitted", "mined", "reverted"])
    assert.throws(() => {
      assertC5SourceNotSubmitted([{ action: "c5-create", state }], "c5-create");
    });
  assert.doesNotThrow(() => {
    assertC5SourceNotSubmitted([{ action: "c5-create", state: "planned" }], "c5-create");
  });
});

await test("C5 creation requires exact claim fields and payer/vault backing deltas", () => {
  assert.doesNotThrow(() => {
    checkC5SourceTransition("create", terms, empty, created);
  });
  for (const altered of [
    { ...created, backing: 0n },
    { ...created, balances: { ...created.balances, payer: 100000000n } },
    { ...created, claim: { ...claim(created), claimId: 5n } },
    { ...created, claim: { ...claim(created), referenceHash: `0x${"11".repeat(32)}` as const } },
    { ...created, claim: { ...claim(created), currentBeneficiary: terms.buyer } },
  ])
    assert.throws(() => {
      checkC5SourceTransition("create", terms, empty, altered);
    });
});

await test("C5 two source rounds preserve old cancellation and move no principal", () => {
  checkC5SourceTransition("reserve1", terms, created, reserved1);
  checkC5SourceTransition("cancel1", terms, reserved1, cancelled1);
  checkC5SourceTransition("reserve2", terms2, cancelled1, reserved2);
  assert.throws(() => {
    checkC5SourceTransition("reserve2", terms2, reserved1, reserved2);
  });
  assert.throws(() => {
    checkC5SourceTransition("reserve2", terms2, cancelled1, {
      ...reserved2,
      rounds: [reserved1.rounds[0], reserved2.rounds[1]],
    });
  });
  assert.throws(() => {
    checkC5SourceTransition("cancel1", terms, reserved1, {
      ...cancelled1,
      balances: { ...cancelled1.balances, buyer: 1n },
    });
  });
  assert.throws(() => {
    checkC5SourceTransition("reserve1", terms, created, {
      ...reserved1,
      rounds: [{ terms: terms2, state: 1n, ...saleIdentity(terms2) }, null],
    });
  });
});

await test("C5 assigned round redeems only to buyer while retaining both outcomes", () => {
  const assigned: C5SourceSnapshot = {
    ...reserved2,
    claim: {
      ...claim(reserved2),
      activeRound: 0n,
      currentBeneficiary: terms.buyer,
      successfulSale: true,
    },
    rounds: [cancelled1.rounds[0], { terms: terms2, state: 2n, ...saleIdentity(terms2) }],
  };
  const redeemed: C5SourceSnapshot = {
    ...assigned,
    claim: { ...claim(assigned), redeemed: true },
    backing: 0n,
    balances: { ...assigned.balances, buyer: 10000000n, vault: 0n },
  };
  checkC5SourceTransition("redeem", terms2, assigned, redeemed);
  assert.throws(() => {
    checkC5SourceTransition("redeem", terms2, redeemed, redeemed);
  });
  assert.throws(() => {
    checkC5SourceTransition("cancel2", terms2, assigned, assigned);
  });
  assert.throws(() => {
    checkC5SourceTransition("redeem", terms2, assigned, {
      ...redeemed,
      balances: { ...redeemed.balances, buyer: 0n, seller: 10000000n },
    });
  });
});

await test("C5 aborted or cancelled source lifecycle can redeem only to seller", () => {
  const cancelled2: C5SourceSnapshot = {
    ...reserved2,
    claim: { ...claim(reserved2), activeRound: 0n },
    rounds: [cancelled1.rounds[0], { terms: terms2, state: 3n, ...saleIdentity(terms2) }],
  };
  checkC5SourceTransition("cancel2", terms2, reserved2, cancelled2);
  for (const before of [created, cancelled1, cancelled2]) {
    checkC5SourceTransition("redeem", terms, before, {
      ...before,
      claim: { ...claim(before), redeemed: true },
      backing: 0n,
      balances: { ...before.balances, seller: 10000000n, vault: 0n },
    });
  }
});
