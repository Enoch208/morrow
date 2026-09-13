import assert from "node:assert/strict";
import test from "node:test";
import { stateLanguage, destinationStates } from "@morrow/protocol";
import { prepareAssignment } from "../src/preflight.ts";
import { campaignActors, campaignContracts, campaignTerms } from "../src/campaign-config.ts";
import { saleIdentity } from "../src/canonical.ts";
import type { DestinationPreflightRead, SourcePreflightRead } from "../src/preflight.ts";

const terms = campaignTerms("a", 2n);
const now = 1789255000n;
const source: SourcePreflightRead = {
  chainId: 11155111n,
  blockNumber: 10,
  blockHash: "0x" + "11".repeat(32),
  timestamp: now,
  vaultCodeHash: campaignContracts.vault.codeHash,
  terms,
  ...saleIdentity(terms),
  state: 1n,
  activeRound: 1n,
  beneficiary: terms.seller,
  faceValueRaw: terms.sourceFaceValueRaw,
  maturity: terms.maturity,
  sourceToken: terms.sourceToken,
  successfulSale: false,
  redeemed: false,
  vaultBalance: terms.sourceFaceValueRaw,
  totalBacking: terms.sourceFaceValueRaw,
};
const destination: DestinationPreflightRead = {
  chainId: 102031n,
  blockNumber: 20,
  blockHash: "0x" + "22".repeat(32),
  timestamp: now,
  finalized: true,
  marketCodeHash: campaignContracts.market.codeHash,
  tokenCodeHash: campaignContracts.settlementToken.codeHash,
  terms,
  state: 1n,
  totalBound: terms.grossPurchasePriceRaw,
  totalCredits: 0n,
  totalLiabilities: terms.grossPurchasePriceRaw,
  marketBalance: terms.grossPurchasePriceRaw,
  fundingStatus: 1,
  fundingBlockNumber: 19,
  fundingMatches: true,
};

await test("T58 stalled prover or destination read is unverifiable, never cancelled or paid", async () => {
  await assert.rejects(
    prepareAssignment(
      terms,
      campaignActors.SELLER,
      11155111n,
      {
        source: () => Promise.resolve(source),
        destination: () => Promise.reject(new Error("prover offline")),
      },
      () => now,
    ),
  );
  assert.equal(stateLanguage.EVIDENCE_UNAVAILABLE, "Evidence unavailable");
  assert.notEqual(stateLanguage.EVIDENCE_UNAVAILABLE, stateLanguage.SELLER_PAID);
  assert.notEqual(stateLanguage.EVIDENCE_UNAVAILABLE, stateLanguage.REFUND_WITHDRAWN);
  assert.notEqual(stateLanguage.WAITING_FOR_ATTESTATION, stateLanguage.SELLER_PAID);
  assert.notEqual(stateLanguage.WAITING_FOR_ATTESTATION, stateLanguage.REFUND_WITHDRAWN);
  assert.deepEqual(destinationStates, ["ABSENT", "BOUND", "ASSIGNED_CLAIMABLE", "CANCELLED_CLAIMABLE"]);
  assert.notEqual(destination.state, 2n);
  assert.notEqual(destination.state, 3n);
});
