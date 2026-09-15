import assert from "node:assert/strict";
import test from "node:test";
import { ZeroAddress } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { campaignActors, campaignContracts, campaignTerms } from "../src/campaign-config.ts";
import { streamOutcome } from "../src/stream-config.ts";
import { validateStreamAssignment } from "../src/stream-preflight.ts";
import type { StreamAssignmentRead } from "../src/stream-preflight.ts";
import { createdClaimId, tradeFaceValueRaw } from "../src/trade-claim.ts";
import { contractInterfaces } from "../src/contract-reads.ts";

await test("a mined refusal needs status 0, no logs and the expected replayed error", () => {
  assert.equal(streamOutcome("UnsupportedStream", 0, 0, "UnsupportedStream"), "refused");
  assert.equal(streamOutcome("UnsupportedStream", 0, 0, undefined), "unexpected");
  assert.equal(streamOutcome("UnsupportedStream", 0, 1, "UnsupportedStream"), "unexpected");
  assert.equal(streamOutcome("UnsupportedStream", 1, 0, "UnsupportedStream"), "unexpected");
  assert.equal(streamOutcome(undefined, 1, 3, undefined), "mined");
  assert.equal(streamOutcome(undefined, 0, 0, undefined), "unexpected");
});

const terms: SaleTerms = {
  ...campaignTerms("a", 1n),
  sourceVault: "0xcE56c5bFA02cC66C73f0D2A736Cf62758769D94f",
  destinationMarket: "0x6Ab39ab673A141b960DC1d29b47b1774F9665f9D",
  assignBefore: 2_000n,
  fundBefore: 1_500n,
  maturity: 3_000n,
};
const read: StreamAssignmentRead = {
  now: 1_000n,
  destinationChainId: 102031n,
  marketRuntimeMatches: true,
  vaultRuntimeMatches: true,
  marketPins: [
    terms.sourceVault,
    terms.sourceToken,
    terms.settlementToken,
    terms.feeBps,
    terms.feeRecipient,
  ],
  destinationTerms: terms,
  destinationState: 1n,
  totalBound: terms.grossPurchasePriceRaw,
  totalCredits: 0n,
  totalLiabilities: terms.grossPurchasePriceRaw,
  marketBalance: terms.grossPurchasePriceRaw,
  fundingFinalized: true,
  sourceTerms: terms,
  sourceState: 1n,
  activeRound: terms.round,
};

await test("stream assignment requires provenance, pins, BOUND funds, finality and an open round", () => {
  validateStreamAssignment(read, terms);
  for (const patch of [
    { destinationChainId: 1n },
    { marketRuntimeMatches: false },
    { vaultRuntimeMatches: false },
    {
      marketPins: [
        ZeroAddress,
        terms.sourceToken,
        terms.settlementToken,
        terms.feeBps,
        terms.feeRecipient,
      ] as const,
    },
    { destinationState: 0n },
    { destinationTerms: { ...terms, grossPurchasePriceRaw: 1n } },
    { marketBalance: terms.grossPurchasePriceRaw - 1n },
    { totalLiabilities: 1n },
    { fundingFinalized: false },
    { sourceState: 2n },
    { activeRound: 0n },
    { sourceTerms: { ...terms, buyer: campaignActors.SELLER } },
    { now: terms.assignBefore },
  ] satisfies Partial<StreamAssignmentRead>[]) {
    assert.throws(() => {
      validateStreamAssignment({ ...read, ...patch }, terms);
    });
  }
});

await test("the created claim id comes from the mined ClaimFunded log matching the request", () => {
  const maturity = 1_789_428_832n;
  const vault = contractInterfaces.vault;
  const funded = (payer: string, beneficiary: string, face: bigint, id: bigint) => {
    const log = vault.encodeEventLog("ClaimFunded", [
      id,
      payer,
      beneficiary,
      campaignContracts.sourceToken.address,
      face,
      maturity,
      `0x${"00".repeat(32)}`,
    ]);
    return { address: campaignContracts.vault.address, topics: log.topics, data: log.data };
  };
  const receipt = (logs: ReturnType<typeof funded>[]) => ({ logs });
  assert.equal(
    createdClaimId(
      receipt([funded(campaignActors.PAYER, campaignActors.SELLER, tradeFaceValueRaw, 9n)]),
      campaignActors.PAYER,
      { maturity },
    ),
    9n,
  );
  for (const logs of [
    [],
    [funded(campaignActors.PAYER, campaignActors.BUYER, tradeFaceValueRaw, 9n)],
    [funded(campaignActors.PAYER, campaignActors.SELLER, 1n, 9n)],
    [funded(campaignActors.SELLER, campaignActors.SELLER, tradeFaceValueRaw, 9n)],
  ]) {
    assert.throws(() => createdClaimId(receipt(logs), campaignActors.PAYER, { maturity }));
  }
});
