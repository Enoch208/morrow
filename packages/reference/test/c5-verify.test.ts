import assert from "node:assert/strict";
import test from "node:test";
import { c5ReferenceTerms, c5StageStatus } from "../src/c5-policy.ts";
import { referenceEconomics, referenceIdentity } from "../src/index.ts";
import { checkC5SourceEvent } from "../src/c5-source-event.ts";
import { applicationInterfaces } from "../src/manifest-chain.ts";
import { c5Actors, c5JournalIntents } from "../src/c5-policy.ts";

await test("C5 independent commitments separate rounds while retaining one claim", () => {
  const first = referenceIdentity(c5ReferenceTerms("4", "1"));
  const second = referenceIdentity(c5ReferenceTerms("4", "2"));
  assert.equal(first.claimKey, second.claimKey);
  assert.notEqual(first.saleId, second.saleId);
  assert.notEqual(first.termsHash, second.termsHash);
  assert.deepEqual(referenceEconomics("9410000", "50"), {
    grossPurchasePriceRaw: "9410000",
    feeRaw: "47050",
    sellerNetRaw: "9362950",
  });
  assert.throws(() => {
    c5ReferenceTerms("0", "1");
  });
  assert.throws(() => {
    c5ReferenceTerms("4", "3");
  });
});

await test("C5 incremental evidence never converts missing stages or runner flags to release success", () => {
  const early = c5StageStatus(new Set(["c5-create", "c5-r1-reserve"]));
  assert.equal(early.fullReleaseVerified, false);
  assert.equal(early.c5Verified, false);
  assert.ok(early.missing.includes("c5-refusal"));
  assert.ok(early.missing.includes("c5-r2-fund"));
  assert.equal(early.verified.length, 2);
});

await test("C5 source events bind full topics, round identity and canonical term bytes", () => {
  const terms = c5ReferenceTerms("4", "1"),
    identity = referenceIdentity(terms);
  const fragment = applicationInterfaces.vault.getEvent("SaleReserved");
  assert.ok(fragment);
  const event = applicationInterfaces.vault.encodeEventLog(fragment, [
    identity.saleId,
    "4",
    "1",
    identity.termsHash,
    identity.encodedTerms,
  ]);
  assert.doesNotThrow(() => {
    checkC5SourceEvent("c5-r1-reserve", "4", c5Actors.seller, event);
  });
  for (const index of [0, 1, 2, 3]) {
    const topics = [...event.topics];
    topics[index] = "0x" + "12".repeat(32);
    assert.throws(() => {
      checkC5SourceEvent("c5-r1-reserve", "4", c5Actors.seller, { ...event, topics });
    });
  }
  assert.throws(() => {
    checkC5SourceEvent("c5-r1-reserve", "4", c5Actors.seller, {
      ...event,
      data: event.data + "00",
    });
  });
  assert.throws(() => {
    checkC5SourceEvent("c5-r2-reserve", "4", c5Actors.seller, event);
  });
});

await test("C5 completed action cannot conceal another unresolved hash or signer", () => {
  const first = {
    action: "c5-create",
    state: "prepared",
    transactionHash: "0x" + "12".repeat(32),
    chainId: "11155111",
    sender: c5Actors.payer,
  };
  assert.equal(c5JournalIntents([first, { ...first, state: "mined" }]).length, 1);
  assert.throws(() => {
    c5JournalIntents([
      first,
      { ...first, state: "submitted", transactionHash: "0x" + "13".repeat(32) },
    ]);
  }, /conflicting/);
  assert.throws(() => {
    c5JournalIntents([first, { ...first, state: "mined", sender: c5Actors.buyer }]);
  }, /conflicting/);
  assert.throws(() => {
    c5JournalIntents([{ ...first, chainId: "1" }]);
  }, /invalid/);
});
