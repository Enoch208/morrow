import assert from "node:assert/strict";
import test from "node:test";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };

interface AbiItem {
  readonly type: string;
  readonly name?: string;
}

const forbidden = [
  "setVerifier",
  "setMock",
  "setProver",
  "adminResolve",
  "refundAfterTimeout",
  "sweep",
  "emergencyWithdraw",
  "transferOwnership",
  "upgradeTo",
];

function functionNames(abi: readonly AbiItem[]) {
  return abi.flatMap((item) => (item.type === "function" && item.name ? [item.name] : []));
}

await test("T60 published custody ABI has no mock verifier or admin sweep selector", () => {
  const names = [...functionNames(marketAbi), ...functionNames(vaultAbi)];
  for (const selector of forbidden) {
    assert.equal(names.includes(selector), false, selector);
  }
  assert.equal(names.includes("fundReservation"), true);
  assert.equal(names.includes("createClaim"), true);
  assert.equal(names.includes("withdraw"), true);
});
