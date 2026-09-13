import assert from "node:assert/strict";
import test from "node:test";
import { keccak256 } from "ethers";
import { recoveryState, recoveryIntent } from "../src/transaction-recovery.ts";
import { campaignActors, campaignContracts } from "../src/campaign-config.ts";

await test("T56 nonce observations never authorize a resend or claim a missing hash was dropped", () => {
  assert.equal(
    recoveryState({
      receiptStatus: null,
      transactionKnown: false,
      nonce: 5,
      latestNonce: 5,
      pendingNonce: 5,
    }),
    "not-observed",
  );
  assert.equal(
    recoveryState({
      receiptStatus: null,
      transactionKnown: false,
      nonce: 5,
      latestNonce: 6,
      pendingNonce: 6,
    }),
    "nonce-consumed-by-unidentified-transaction",
  );
  assert.equal(
    recoveryState({
      receiptStatus: null,
      transactionKnown: false,
      nonce: 5,
      latestNonce: 5,
      pendingNonce: 6,
    }),
    "pending-nonce-conflict",
  );
  assert.equal(
    recoveryState({
      receiptStatus: null,
      transactionKnown: true,
      nonce: 5,
      latestNonce: 5,
      pendingNonce: 6,
    }),
    "pending",
  );
  assert.equal(
    recoveryState({
      receiptStatus: 1,
      transactionKnown: true,
      nonce: 5,
      latestNonce: 6,
      pendingNonce: 6,
    }),
    "mined-awaiting-poststate",
  );
  assert.equal(
    recoveryState({
      receiptStatus: 0,
      transactionKnown: true,
      nonce: 5,
      latestNonce: 6,
      pendingNonce: 6,
    }),
    "reverted",
  );
});

await test("T56 public intent rejects missing hashes, wrong domains and unapproved senders", () => {
  const value = {
    action: "b-cancel",
    chainId: "11155111",
    sender: campaignActors.SELLER,
    contract: campaignContracts.vault.address,
    nonce: 5,
    transactionHash: "0x8b63c45aae7006dc53181b2f081f1d42d6bef471694b02bb9e8d8af5e1cb27e1",
    calldataHash: keccak256("0x"),
  };
  assert.equal(recoveryIntent(value).nonce, 5);
  for (const changed of [
    { transactionHash: null },
    { chainId: "1" },
    { sender: campaignContracts.vault.address },
    { nonce: -1 },
    { contract: campaignContracts.market.address },
  ])
    assert.throws(() => recoveryIntent({ ...value, ...changed }));
});
