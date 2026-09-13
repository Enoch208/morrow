import assert from "node:assert/strict";
import test from "node:test";
import { assertSourceBlock } from "../src/source-block.ts";

await test("T59 same-block reservation and another claim creation reconcile global backing without attribution errors", () => {
  const changes = [
    { claimId: 2n, name: "SaleReserved", face: 0n, transactionIndex: 9, logIndex: 1 },
    { claimId: 3n, name: "ClaimFunded", face: 10000000000n, transactionIndex: 10, logIndex: 3 },
  ];
  const before = { backing: 10010000000n, balance: 10010000000n, nextClaimId: 3n };
  const after = { backing: 20010000000n, balance: 20010000000n, nextClaimId: 4n };
  assert.equal(assertSourceBlock(changes, before, after).backingDelta, 10000000000n);
  assert.throws(() => assertSourceBlock(changes, before, { ...after, backing: before.backing }));
  assert.throws(() => assertSourceBlock(changes, before, { ...after, nextClaimId: 3n }));
  assert.throws(() =>
    assertSourceBlock(
      changes.map((entry) => ({ ...entry, claimId: 2n })),
      before,
      after,
    ),
  );
});

await test("T59 redemption reduces backing without recycling a claim identifier", () => {
  const before = { backing: 100n, balance: 100n, nextClaimId: 4n };
  const after = { backing: 0n, balance: 0n, nextClaimId: 4n };
  const changes = [
    { claimId: 2n, name: "ClaimRedeemed", face: 100n, transactionIndex: 0, logIndex: 1 },
  ];
  assert.equal(assertSourceBlock(changes, before, after).backingDelta, -100n);
  assert.throws(() => assertSourceBlock(changes, before, { ...after, nextClaimId: 3n }));
  assert.throws(() => assertSourceBlock(changes, before, { ...after, backing: 1n }));
});
