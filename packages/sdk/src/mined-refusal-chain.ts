import { keccak256 } from "ethers";
import type { JsonRpcProvider, Wallet } from "ethers";
import { campaignContracts } from "./campaign-config.ts";
import { json } from "./campaign-log.ts";
import { campaignRead, contractInterfaces, verifyCampaignContract } from "./contract-reads.ts";
import { ConfigurationError } from "./environment.ts";
import { persistThenBroadcast } from "./submission-intent.ts";
import { assertRefusalReceipt, decodeExpectedRefusal, refusalGasLimit } from "./mined-refusal.ts";
import {
  minedRefusalDirectory,
  recordMinedRefusal,
  requireMinedRefusalAction,
} from "./mined-refusal-log.ts";

export interface MinedRefusalScenario {
  readonly action: string;
  readonly expected: string;
  readonly calldata: string;
  readonly proofHash: string;
  readonly proofKind: "current" | "stale";
  readonly saleIds: readonly string[];
  readonly eventKeys: readonly string[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConfigurationError("Invalid evidence record");
  return value as Record<string, unknown>;
}

export function successfulProofGas(records: readonly Record<string, unknown>[]): bigint[] {
  return records.flatMap((entry) => {
    if (
      entry.state !== "mined" ||
      !["fundReservation", "settleAssignment", "recognizeCancellation"].includes(
        String(entry.method),
      )
    )
      return [];
    const receipt = record(entry.receipt);
    const gas = receipt.gasUsed;
    return typeof gas === "string" && /^[1-9][0-9]*$/.test(gas) ? [BigInt(gas)] : [];
  });
}

async function marketSnapshot(
  rpc: JsonRpcProvider,
  blockTag: number,
  scenario: MinedRefusalScenario,
) {
  const [block, totals, balance, sales, consumed] = await Promise.all([
    rpc.getBlock(blockTag),
    Promise.all(
      ["totalBound", "totalCredits", "totalLiabilities"].map((method) =>
        campaignRead(rpc, "market", method, [], blockTag),
      ),
    ),
    campaignRead(rpc, "settlementToken", "balanceOf", [campaignContracts.market.address], blockTag),
    Promise.all(
      scenario.saleIds.map((saleId) => campaignRead(rpc, "market", "getSale", [saleId], blockTag)),
    ),
    Promise.all(
      scenario.eventKeys.map((key) => campaignRead(rpc, "market", "consumed", [key], blockTag)),
    ),
  ]);
  if (!block?.hash) throw new ConfigurationError("Snapshot block unavailable");
  return {
    blockNumber: block.number,
    blockHash: block.hash,
    totals: totals.map((item) => item.raw),
    balance: balance.raw,
    sales: sales.map((item) => item.raw),
    consumed: consumed.map((item) => item.raw),
  };
}

async function expectedCall(
  rpc: JsonRpcProvider,
  scenario: MinedRefusalScenario,
  sender: string,
  blockTag: number,
  gasLimit: bigint,
) {
  try {
    await rpc.call({
      from: sender,
      to: campaignContracts.market.address,
      data: scenario.calldata,
      gasLimit,
      blockTag,
    });
  } catch (error: unknown) {
    return decodeExpectedRefusal(error, contractInterfaces.market, scenario.expected);
  }
  throw new ConfigurationError(`${scenario.action} unexpectedly succeeded`);
}

export async function submitMinedRefusal(
  rpc: JsonRpcProvider,
  wallet: Wallet,
  scenario: MinedRefusalScenario,
  proofGas: readonly bigint[],
  broadcast: boolean,
): Promise<void> {
  requireMinedRefusalAction(scenario.action);
  await verifyCampaignContract(rpc, "market");
  const latest = await rpc.getBlock("latest");
  if (!latest?.hash) throw new ConfigurationError("Destination head unavailable");
  const gasLimit = refusalGasLimit(latest.gasLimit, proofGas);
  const refusal = await expectedCall(rpc, scenario, wallet.address, latest.number, gasLimit);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null || gasPrice <= 0n) throw new ConfigurationError("Gas price unavailable");
  const costCeiling = gasLimit * gasPrice;
  if ((await rpc.getBalance(wallet.address)) < costCeiling)
    throw new ConfigurationError("Insufficient CC3 gas for mined refusal");
  const [pendingNonce, latestNonce] = await Promise.all([
    rpc.getTransactionCount(wallet.address, "pending"),
    rpc.getTransactionCount(wallet.address, "latest"),
  ]);
  if (pendingNonce !== latestNonce) throw new ConfigurationError("Unresolved CC3 account nonce");
  const common = {
    action: scenario.action,
    chainId: campaignContracts.market.chainId,
    sender: wallet.address,
    contract: campaignContracts.market.address,
    expectedError: scenario.expected,
    observedError: refusal.name,
    proofHash: scenario.proofHash,
    proofKind: scenario.proofKind,
    calldataHash: keccak256(scenario.calldata),
    checkedBlockNumber: latest.number,
    checkedBlockHash: latest.hash,
    gasLimit,
    gasPrice,
    costCeiling,
  };
  await recordMinedRefusal({
    ...common,
    evidenceKind: broadcast ? "proposed" : "live-read-verified",
    state: "planned",
    broadcast,
  });
  if (!broadcast) return;
  const signed = await wallet.signTransaction({
    to: campaignContracts.market.address,
    data: scenario.calldata,
    value: 0n,
    chainId: campaignContracts.market.chainId,
    gasLimit,
    gasPrice,
    nonce: pendingNonce,
    type: 0,
  });
  const response = await persistThenBroadcast(
    minedRefusalDirectory,
    scenario.action,
    signed,
    (transactionHash) =>
      recordMinedRefusal({ ...common, state: "prepared", transactionHash, nonce: pendingNonce }),
    (raw) => rpc.broadcastTransaction(raw),
    requireMinedRefusalAction,
  );
  await recordMinedRefusal({ ...common, state: "submitted", transactionHash: response.hash });
  const receipt = await rpc.waitForTransaction(response.hash, 1, 60_000);
  if (!receipt) throw new ConfigurationError("Refusal receipt unavailable; reconcile before retry");
  const block = await rpc.getBlock(receipt.blockNumber);
  if (!block?.hash) throw new ConfigurationError("Refusal receipt block unavailable");
  assertRefusalReceipt(
    receipt,
    response.hash,
    wallet.address,
    campaignContracts.market.address,
    block.number,
    block.hash,
    gasLimit,
  );
  const replay = await expectedCall(
    rpc,
    scenario,
    wallet.address,
    receipt.blockNumber - 1,
    gasLimit,
  );
  const [before, after] = await Promise.all([
    marketSnapshot(rpc, receipt.blockNumber - 1, scenario),
    marketSnapshot(rpc, receipt.blockNumber, scenario),
  ]);
  if (
    json({ ...before, blockNumber: 0, blockHash: "0x" }) !==
    json({ ...after, blockNumber: 0, blockHash: "0x" })
  )
    throw new ConfigurationError("Market state changed across reverted transaction block");
  await recordMinedRefusal({
    ...common,
    evidenceKind: "live-testnet-mined",
    state: "verified",
    transactionHash: receipt.hash,
    receipt: receipt.toJSON(),
    replayError: replay.name,
    before,
    after,
    unchanged: true,
  });
}
