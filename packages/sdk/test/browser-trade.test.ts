import assert from "node:assert/strict";
import test from "node:test";
import { AbiCoder, JsonRpcProvider, Log, ZeroHash } from "ethers";
import type { Claim } from "@morrow/protocol";
import { assertClaimRequest, minimumMaturityLeadSeconds } from "../src/browser-claim.ts";
import { assertCancellableSource } from "../src/browser-cancellation.ts";
import { assertDripAvailable } from "../src/browser-faucet.ts";
import { assertRedeemable } from "../src/browser-redemption.ts";
import { decodeReservation } from "../src/browser-sales.ts";
import { campaignActors, campaignContracts, campaignTerms } from "../src/campaign-config.ts";
import { decodeCanonicalTerms, encodeTerms, saleIdentity } from "../src/canonical.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import type { SourcePreflightRead } from "../src/preflight.ts";

const terms = campaignTerms("a", 7n);
const now = 1_800_000_000n;

await test("claim creation requires a separate recipient, positive amount and one-hour lead", () => {
  const request = {
    faceValueRaw: 10_000_000_000n,
    beneficiary: campaignActors.SELLER,
    maturity: now + minimumMaturityLeadSeconds,
  };
  assertClaimRequest(request, campaignActors.PAYER, now);
  for (const patch of [
    { faceValueRaw: 0n },
    { beneficiary: campaignActors.PAYER },
    { beneficiary: "0x0000000000000000000000000000000000000000" },
    { maturity: now + minimumMaturityLeadSeconds - 1n },
  ]) {
    assert.throws(() => {
      assertClaimRequest({ ...request, ...patch }, campaignActors.PAYER, now);
    });
  }
});

await test("faucet drip refuses cooldown and empty balance before preparing", () => {
  const status = { dripRaw: 20n, faucetBalanceRaw: 20n, nextDripAt: now };
  assertDripAvailable(status, now);
  assert.throws(() => {
    assertDripAvailable(status, now - 1n);
  }, /24 hours/);
  assert.throws(() => {
    assertDripAvailable({ ...status, faucetBalanceRaw: 19n }, now);
  }, /empty/);
});

await test("cancellation needs the exact reserved round at or after the assignment deadline", () => {
  const full: SourcePreflightRead = {
    chainId: 11155111n,
    blockNumber: 1,
    blockHash: ZeroHash,
    timestamp: terms.assignBefore,
    ...saleIdentity(terms),
    vaultCodeHash: campaignContracts.vault.codeHash,
    terms,
    state: 1n,
    activeRound: terms.round,
    beneficiary: terms.seller,
    faceValueRaw: terms.sourceFaceValueRaw,
    maturity: terms.maturity,
    sourceToken: terms.sourceToken,
    successfulSale: false,
    redeemed: false,
    vaultBalance: terms.sourceFaceValueRaw,
    totalBacking: terms.sourceFaceValueRaw,
  };
  assertCancellableSource(full, terms);
  for (const patch of [
    { state: 2n },
    { state: 3n },
    { activeRound: terms.round + 1n },
    { timestamp: terms.assignBefore - 1n },
  ]) {
    assert.throws(() => {
      assertCancellableSource({ ...full, ...patch }, terms);
    });
  }
});

await test("redemption waits for maturity and for no active reservation", () => {
  const claim: Claim = {
    claimId: 7n,
    sourceToken: terms.sourceToken,
    sourceFaceValueRaw: terms.sourceFaceValueRaw,
    maturity: now,
    originalBeneficiary: terms.seller,
    currentBeneficiary: terms.buyer,
    activeRound: 0n,
    latestRound: 1n,
    successfulSale: true,
    redeemed: false,
    referenceHash: `0x${"00".repeat(32)}`,
  };
  assertRedeemable(claim, now);
  assert.throws(() => {
    assertRedeemable(claim, now - 1n);
  }, /matured/);
  assert.throws(() => {
    assertRedeemable({ ...claim, redeemed: true }, now);
  }, /already/);
  assert.throws(() => {
    assertRedeemable({ ...claim, activeRound: 1n }, now);
  }, /Cancel/);
});

await test("canonical terms decode only from their unique encoding", () => {
  const encoded = encodeTerms(terms);
  assert.deepEqual(decodeCanonicalTerms(encoded), terms);
  const dirty = `${encoded.slice(0, 2 + 64 * 14)}${"f".repeat(60)}${encoded.slice(2 + 64 * 14 + 60)}`;
  assert.throws(() => decodeCanonicalTerms(dirty));
  const truncated = AbiCoder.defaultAbiCoder().encode(["uint256"], [1n]);
  assert.throws(() => decodeCanonicalTerms(truncated));
});

await test("discovered reservations must carry terms that reproduce their indexed saleId", () => {
  const identity = saleIdentity(terms);
  const event = contractInterfaces.vault.encodeEventLog("SaleReserved", [
    identity.saleId,
    terms.claimId,
    terms.round,
    identity.termsHash,
    encodeTerms(terms),
  ]);
  const offline = new JsonRpcProvider(undefined, 11155111, { staticNetwork: true });
  const log = (topics: readonly string[]) =>
    new Log(
      {
        address: campaignContracts.vault.address,
        topics,
        data: event.data,
        blockNumber: 1,
        blockHash: ZeroHash,
        transactionHash: ZeroHash,
        transactionIndex: 0,
        index: 0,
        removed: false,
      },
      offline,
    );
  assert.deepEqual(decodeReservation(log(event.topics)).terms, terms);
  const forged = [...event.topics];
  forged[1] = saleIdentity({ ...terms, grossPurchasePriceRaw: 1n }).saleId;
  assert.throws(() => decodeReservation(log(forged)), /do not match/);
  offline.destroy();
});
