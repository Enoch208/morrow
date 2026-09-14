import assert from "node:assert/strict";
import test from "node:test";
import { campaignContracts } from "../src/campaign-config.ts";
import {
  checkFaucetBudget,
  faucetAction,
  faucetConstructorArguments,
  faucetSide,
} from "../src/faucet-config.ts";
import { minedFaucetAddress } from "../src/faucet-log.ts";

await test("faucet actions resolve to the pinned token on the matching chain", () => {
  assert.deepEqual(faucetSide("fund-source-faucet"), {
    deployAction: "deploy-source-faucet",
    chainId: 11155111n,
    token: campaignContracts.sourceToken.address,
  });
  assert.equal(faucetSide("deploy-settlement-faucet").chainId, 102031n);
  assert.deepEqual(faucetConstructorArguments("deploy-settlement-faucet"), [
    campaignContracts.settlementToken.address,
    20_000_000_000n,
    86_400n,
  ]);
  assert.throws(() => {
    faucetAction("drain-faucet");
  }, /Choose/);
});

await test("faucet budget refuses repeats, wrong chains and cap overruns", () => {
  assert.doesNotThrow(() => {
    checkFaucetBudget([], "deploy-source-faucet", 11155111n, 1n);
  });
  assert.throws(() => {
    checkFaucetBudget([], "deploy-source-faucet", 102031n, 1n);
  }, /wrong chain/);
  assert.throws(() => {
    checkFaucetBudget(
      [{ action: "deploy-source-faucet", state: "submitted", chainId: "11155111" }],
      "deploy-source-faucet",
      11155111n,
      1n,
    );
  }, /already prepared/);
  assert.throws(() => {
    checkFaucetBudget(
      [
        {
          action: "deploy-source-faucet",
          state: "mined",
          chainId: "11155111",
          costCeiling: "9999999999999999",
        },
      ],
      "fund-source-faucet",
      11155111n,
      2n,
    );
  }, /gas cap/);
  assert.throws(() => {
    checkFaucetBudget(
      [{ action: "deploy-source-faucet", state: "mined", chainId: "11155111", costCeiling: "x" }],
      "fund-source-faucet",
      11155111n,
      1n,
    );
  }, /Invalid faucet gas record/);
});

await test("funding requires a mined faucet deployment record", () => {
  assert.throws(() => {
    minedFaucetAddress([], "deploy-source-faucet");
  }, /No mined faucet/);
  assert.equal(
    minedFaucetAddress(
      [
        { action: "deploy-source-faucet", state: "planned" },
        { action: "deploy-source-faucet", state: "mined", contractAddress: "0x1" },
      ],
      "deploy-source-faucet",
    ),
    "0x1",
  );
});
