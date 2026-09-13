import assert from "node:assert/strict";
import test from "node:test";
import { campaignContracts, campaignTerms, campaignActors } from "../src/campaign-config.ts";
import { saleIdentity } from "../src/canonical.ts";
import { prepareAssignment } from "../src/preflight.ts";
import type { SourcePreflightRead, DestinationPreflightRead } from "../src/preflight.ts";
import { contractArtifact } from "../src/artifact.ts";

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

function readers(s = source, d = destination) {
  return { source: () => Promise.resolve(s), destination: () => Promise.resolve(d) };
}

await test("seller preflight prepares exact round/hash only after repeated live checks", async () => {
  let sourceReads = 0;
  const result = await prepareAssignment(
    terms,
    campaignActors.SELLER,
    11155111n,
    {
      source: () => {
        sourceReads++;
        return Promise.resolve(source);
      },
      destination: () => Promise.resolve(destination),
    },
    () => now,
  );
  assert.equal(sourceReads, 2);
  assert.equal(result.to, terms.sourceVault);
  assert.equal(result.sellerNetRaw, 9362950000n);
  assert.equal(
    result.data,
    contractArtifact("FundedPaymentVault").abi.encodeFunctionData("assignSale", [
      terms.claimId,
      terms.round,
      saleIdentity(terms).termsHash,
    ]),
  );
  assert.deepEqual(
    await prepareAssignment(terms, terms.seller, 11155111n, readers(), () => now),
    result,
  );
});

await test("T53 destination empty, unfinalized or reverted funding blocks signature preparation", async () => {
  for (const patch of [
    { state: 0n },
    { finalized: false },
    { fundingStatus: 0 },
    { fundingBlockNumber: 21 },
    { fundingMatches: false },
  ]) {
    await assert.rejects(
      prepareAssignment(
        terms,
        terms.seller,
        11155111n,
        readers(source, { ...destination, ...patch }),
        () => now,
      ),
    );
  }
});

await test("T53 finality retry is distinct from a mismatched funding receipt", async () => {
  const prepare = (fundingMatches: boolean) =>
    prepareAssignment(
      terms,
      terms.seller,
      11155111n,
      readers(source, { ...destination, fundingBlockNumber: 21, fundingMatches }),
      () => now,
    );
  await assert.rejects(prepare(true), { message: "Funding transaction is unfinalized" });
  await assert.rejects(prepare(false), {
    message: "Funding transaction is missing, reverted, unfinalized or mismatched",
  });
});

await test("T54 mismatched price, buyer, runtime or insufficient backing fails closed", async () => {
  for (const patch of [
    { terms: { ...terms, grossPurchasePriceRaw: 1n } },
    { terms: { ...terms, buyer: campaignActors.PAYER } },
    { marketCodeHash: "0x00" },
    { marketBalance: 0n },
    { timestamp: now - 121n },
  ])
    await assert.rejects(
      prepareAssignment(
        terms,
        terms.seller,
        11155111n,
        readers(source, { ...destination, ...patch }),
        () => now,
      ),
    );
});

await test("T54 source cancellation during preflight and RPC failure cannot prepare a signature", async () => {
  let reads = 0;
  await assert.rejects(
    prepareAssignment(
      terms,
      terms.seller,
      11155111n,
      {
        source: () => {
          reads++;
          return Promise.resolve(reads === 1 ? source : { ...source, state: 3n, activeRound: 0n });
        },
        destination: () => Promise.resolve(destination),
      },
      () => now,
    ),
  );
  await assert.rejects(
    prepareAssignment(
      terms,
      terms.seller,
      11155111n,
      {
        source: () => Promise.reject(new Error("RPC unavailable")),
        destination: () => Promise.resolve(destination),
      },
      () => now,
    ),
  );
});

await test("T54 destination evidence cannot become stale during the final source read", async () => {
  let reads = 0;
  await assert.rejects(
    prepareAssignment(
      terms,
      terms.seller,
      11155111n,
      {
        source: () => {
          reads++;
          return Promise.resolve(reads === 1 ? source : { ...source, timestamp: now + 121n });
        },
        destination: () => Promise.resolve(destination),
      },
      () => (reads < 2 ? now : now + 121n),
    ),
    /Stale or inconsistent chain timestamp/,
  );
});
