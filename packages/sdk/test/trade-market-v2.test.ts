import assert from "node:assert/strict";
import test from "node:test";
import { Interface, ZeroHash } from "ethers";
import type { TransactionReceipt } from "ethers";
import marketV2Abi from "../../../schemas/abi/MorrowMarketV2.json" with { type: "json" };
import { campaignContracts } from "../src/campaign-config.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import { nativeAddresses, nativeInterfaces } from "../src/native.ts";
import { contractsForMarket, tradeContracts } from "../src/trade-contracts.ts";
import { isProbeStep, probeSucceeded } from "../src/trade-probe.ts";
import { tradeChain, tradeSigner } from "../src/trade-roles.ts";
import { tradeSteps } from "../src/trade-log.ts";

const receipt = (status: number, logs: { address: string; topics: string[] }[]) =>
  ({ status, logs }) as unknown as TransactionReceipt;

await test("the trade market keeps every campaign market function and adds only errors", () => {
  const v2 = new Interface(marketV2Abi);
  const functions = (abi: Interface) =>
    abi.fragments
      .filter((fragment) => fragment.type === "function" || fragment.type === "event")
      .map((fragment) => fragment.format("sighash"))
      .sort();
  assert.deepEqual(functions(v2), functions(contractInterfaces.market));
  for (const name of ["InsufficientAttestedDepth", "UnsupportedSourceChain", "WrongChainKey"])
    assert.ok(v2.getError(name));
});

await test("each sale resolves to exactly the pinned deployment of its own market", () => {
  assert.equal(contractsForMarket(campaignContracts.market.address), campaignContracts);
  assert.equal(contractsForMarket(tradeContracts.market.address.toLowerCase()), tradeContracts);
  assert.equal(tradeContracts.vault, campaignContracts.vault);
  assert.notEqual(tradeContracts.market.codeHash, campaignContracts.market.codeHash);
  assert.throws(() => contractsForMarket(nativeAddresses.blockProver));
});

await test("a shallow funding refusal needs status 0, no logs and the replayed depth error", () => {
  assert.ok(probeSucceeded("fund-shallow-refused", receipt(0, []), "InsufficientAttestedDepth"));
  assert.ok(!probeSucceeded("fund-shallow-refused", receipt(0, []), "SaleAlreadyExists"));
  assert.ok(!probeSucceeded("fund-shallow-refused", receipt(0, []), undefined));
  assert.ok(!probeSucceeded("fund-shallow-refused", receipt(1, []), "InsufficientAttestedDepth"));
  const log = { address: tradeContracts.market.address, topics: [ZeroHash] };
  assert.ok(
    !probeSucceeded("fund-shallow-refused", receipt(0, [log]), "InsufficientAttestedDepth"),
  );
});

await test("a front-run verification counts only with the native TransactionVerified log", () => {
  const topic = nativeInterfaces.blockProver.getEvent("TransactionVerified")?.topicHash ?? "";
  const native = { address: nativeAddresses.blockProver, topics: [topic] };
  assert.ok(probeSucceeded("verify-front-run", receipt(1, [native]), undefined));
  assert.ok(!probeSucceeded("verify-front-run", receipt(0, [native]), undefined));
  assert.ok(!probeSucceeded("verify-front-run", receipt(1, []), undefined));
  const forged = { address: tradeContracts.market.address, topics: [topic] };
  assert.ok(!probeSucceeded("verify-front-run", receipt(1, [forged]), undefined));
});

await test("probes run on Creditcoin between buyer approval and funding", () => {
  assert.ok(isProbeStep("fund-shallow-refused") && isProbeStep("verify-front-run"));
  assert.ok(!isProbeStep("fund"));
  assert.equal(tradeSigner["fund-shallow-refused"], "BUYER");
  assert.equal(tradeSigner["verify-front-run"], "PAYER");
  assert.equal(tradeChain("fund-shallow-refused"), 102031n);
  assert.equal(tradeChain("verify-front-run"), 102031n);
  const order = ["approve-fund", "fund-shallow-refused", "verify-front-run", "fund"];
  assert.deepEqual(
    order.map((step) => tradeSteps.indexOf(step as (typeof tradeSteps)[number])),
    [...order.map((step) => tradeSteps.indexOf(step as (typeof tradeSteps)[number]))].sort(
      (a, b) => a - b,
    ),
  );
});
