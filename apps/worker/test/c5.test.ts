import assert from "node:assert/strict";
import test from "node:test";
import { c5Plan } from "../src/c5.ts";
import { c5Job, c5Complete } from "../src/c5-state.ts";

type Row = Record<string, unknown>;
const transactionHash = `0x${"ab".repeat(32)}`;
function complete(operation: string): Row[] {
  const job = c5Job(operation);
  return [
    ...(job.signs ? [{ action: job.action, state: "mined", transactionHash }] : []),
    { action: job.action, state: job.completeState, transactionHash },
  ];
}
const initial = [
  { action: "c5-create", state: "mined", transactionHash },
  { action: "c5-create", state: "claim-verified", transactionHash },
  { action: "c5-r1-reserve", state: "mined", transactionHash },
  { action: "c5-r1-reserve", state: "reservation-verified", transactionHash },
];
const second = [...initial, ...complete("cancel1"), ...complete("reserve2")];
const funded = [
  ...second,
  ...complete("proof-r1-cancel"),
  ...complete("proof-r2-reserve"),
  ...complete("approve-settlement"),
  ...complete("fund"),
];
const assigned = [...funded, ...complete("assign"), ...complete("proof-r2-assign")];

await test("C5 worker archives promptly but cancellation and round-2 launch outrank proof waits", () => {
  assert.equal(c5Plan(initial, 1789290000n).job?.operation, "proof-r1-reserve");
  assert.equal(
    c5Plan(initial, 1789295399n, new Set(), new Set(["c5-r1-reserve-proof"])).state,
    "waiting",
  );
  assert.equal(c5Plan(initial, 1789295400n).job?.operation, "cancel1");
  assert.equal(
    c5Plan([...initial, ...complete("cancel1")], 1789295401n).job?.operation,
    "reserve2",
  );
  assert.equal(c5Plan([...initial, ...complete("cancel1")], 1789296301n).state, "waiting");
  assert.equal(c5Plan([...initial, ...complete("cancel1")], 1789306200n).job?.operation, "redeem");
});

await test("C5 funding requires both proofs and exact approval before ten-minute cutoff", () => {
  assert.equal(c5Plan(second, 1789297000n).job?.operation, "proof-r1-cancel");
  const cancelProof = [...second, ...complete("proof-r1-cancel")];
  assert.equal(c5Plan(cancelProof, 1789297000n).job?.operation, "proof-r2-reserve");
  const proofs = [...cancelProof, ...complete("proof-r2-reserve")];
  assert.equal(c5Plan(proofs, 1789297000n).job?.operation, "approve-settlement");
  const approved = [...proofs, ...complete("approve-settlement")];
  assert.equal(c5Plan(approved, 1789299299n).job?.operation, "fund");
  assert.equal(c5Plan(approved, 1789299300n).state, "waiting");
  assert.equal(c5Plan(approved, 1789301700n).job?.operation, "cancel2");
});

await test("C5 never schedules time-only BOUND refunds or cancellation of assigned round", () => {
  assert.equal(c5Plan(funded, 1789301699n).job?.operation, "assign");
  assert.equal(c5Plan(funded, 1789301700n).job?.operation, "cancel2");
  const cancelled = [...funded, ...complete("cancel2")];
  assert.equal(c5Plan(cancelled, 1789301700n).job?.operation, "proof-r2-cancel");
  assert.equal(
    c5Plan([...cancelled, ...complete("proof-r2-cancel")], 1789301700n).job?.operation,
    "refund",
  );
  assert.equal(c5Plan(assigned, 1789306200n).job?.operation, "refusal");
  assert.equal(
    c5Plan(assigned, 1789306200n, new Set(), new Set(["c5-refusal"])).job?.operation,
    "settle",
  );
});

await test("C5 legitimate cleanup survives refusal failure and proceeds to correct withdrawals", () => {
  const settled = [...assigned, ...complete("settle")];
  assert.equal(c5Plan(settled, 1789306200n).job?.operation, "withdraw-seller");
  const sellerPaid = [...settled, ...complete("withdraw-seller")];
  assert.equal(c5Plan(sellerPaid, 1789306200n).job?.operation, "withdraw-fee");
  const paid = [...sellerPaid, ...complete("withdraw-fee")];
  assert.equal(c5Plan(paid, 1789306200n).job?.operation, "redeem");
  assert.equal(c5Plan([...paid, ...complete("redeem")], 1789306200n).state, "complete");
});

await test("C5 every unresolved submission blocks all later jobs, including orphan locks", () => {
  for (const state of ["prepared", "submitted", "mined", "reverted"])
    assert.equal(
      c5Plan([...initial, { action: "c5-r2-fund", state, transactionHash }], 1789295400n).state,
      "reconcile",
    );
  assert.equal(c5Plan(initial, 1789295400n, new Set(["c5-r2-fund"])).state, "reconcile");
  assert.equal(c5Plan(initial, 1789295400n, new Set(["c5-r1-reserve"])).job?.operation, "cancel1");
  assert.equal(
    c5Complete("c5-r2-fund", [{ action: "c5-r2-fund", state: "bound-verified", transactionHash }]),
    false,
  );
  assert.equal(
    c5Complete("c5-r2-fund", [
      { action: "c5-r2-fund", state: "mined", transactionHash },
      { action: "c5-r2-fund", state: "bound-verified", transactionHash: `0x${"cd".repeat(32)}` },
    ]),
    false,
  );
});

await test("C5 dry planner cannot schedule new claims, first-round funding or unapproved operations", () => {
  assert.equal(c5Plan([], 1789289000n).state, "blocked");
  assert.throws(() => {
    c5Job("create");
  });
  assert.throws(() => {
    c5Job("fund1");
  });
  const proofStopped = new Set(["c5-r1-cancel-proof"]);
  assert.equal(c5Plan(second, 1789297000n, new Set(), proofStopped).state, "waiting");
  assert.equal(c5Plan(second, 1789301700n, new Set(), proofStopped).job?.operation, "cancel2");
});

await test("C5 unused destination allowance is revoked after unfunded cancellation", () => {
  const cancelled = [...second, ...complete("approve-settlement"), ...complete("cancel2")];
  assert.equal(c5Plan(cancelled, 1789301700n).job?.operation, "revoke-settlement");
  const revoked = [...cancelled, ...complete("revoke-settlement")];
  assert.equal(c5Plan(revoked, 1789306200n).job?.operation, "redeem");
  const refunded = [
    ...funded,
    ...complete("cancel2"),
    ...complete("proof-r2-cancel"),
    ...complete("refund"),
  ];
  assert.equal(c5Plan(refunded, 1789301700n).job?.operation, "withdraw-buyer");
});
