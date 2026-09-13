import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { c5Terms, c5Times } from "./c5-config.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import { recordC5 } from "./c5-log.ts";
import { ConfigurationError } from "./errors.ts";

type Operation = "approve" | "reset" | "revoke";
type Side = "source" | "settlement";
interface AllowanceState {
  timestamp: bigint;
  allowance: bigint;
  balance: bigint;
  spenderBalance: bigint;
}

export function checkC5Allowance(
  operation: Operation,
  side: Side,
  state: AllowanceState,
  now: bigint,
  expectedCurrent?: bigint,
): void {
  if (now - state.timestamp > 120n || state.timestamp - now > 30n)
    throw new ConfigurationError("C5 allowance chain timestamp is stale or inconsistent");
  if (expectedCurrent !== undefined && state.allowance !== expectedCurrent)
    throw new ConfigurationError("C5 allowance changed during signing preparation");
  if (state.allowance < 0n || state.balance < 0n || state.spenderBalance < 0n)
    throw new ConfigurationError("C5 invalid token balance or allowance");
  if (operation !== "approve") return;
  const terms = c5Terms(0n, 2n);
  const cutoff = side === "source" ? c5Times.launch : terms.fundBefore;
  const amount = side === "source" ? terms.sourceFaceValueRaw : terms.grossPurchasePriceRaw;
  if (now >= cutoff || state.timestamp >= cutoff)
    throw new ConfigurationError("C5 allowance admission window elapsed");
  if (state.balance < amount)
    throw new ConfigurationError("C5 token balance cannot cover exact approval");
  if (state.allowance !== 0n && state.allowance !== amount)
    throw new ConfigurationError("Reset nonzero C5 allowance before exact approval");
}

async function allowanceSnapshot(
  rpc: JsonRpcProvider,
  side: Side,
  tag: number | "latest" = "latest",
) {
  const source = side === "source";
  const owner = source ? campaignActors.PAYER : campaignActors.BUYER;
  const spender = source ? campaignContracts.vault.address : campaignContracts.market.address;
  const key = source ? "sourceToken" : "settlementToken";
  const block = await rpc.getBlock(tag);
  if (!block?.hash) throw new ConfigurationError("C5 allowance block unavailable");
  await Promise.all([
    verifyCampaignContract(rpc, key, block.number),
    verifyCampaignContract(rpc, source ? "vault" : "market", block.number),
  ]);
  const [allowance, balance, spenderBalance] = await Promise.all([
    campaignRead(rpc, key, "allowance", [owner, spender], block.number),
    campaignRead(rpc, key, "balanceOf", [owner], block.number),
    campaignRead(rpc, key, "balanceOf", [spender], block.number),
  ]);
  const canonical: unknown = await rpc.send("eth_getBlockByNumber", [
    `0x${block.number.toString(16)}`,
    false,
  ]);
  if (
    !canonical ||
    typeof canonical !== "object" ||
    !("hash" in canonical) ||
    canonical.hash !== block.hash
  )
    throw new ConfigurationError("C5 allowance snapshot reorganized");
  return {
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: BigInt(block.timestamp),
    allowance: decodedInteger(allowance.decoded[0]),
    balance: decodedInteger(balance.decoded[0]),
    spenderBalance: decodedInteger(spenderBalance.decoded[0]),
    allowanceRaw: allowance.raw,
    balanceRaw: balance.raw,
    spenderBalanceRaw: spenderBalance.raw,
  };
}

export async function c5Allowance(
  context: C5Context,
  operation: Operation,
  side: Side,
  broadcast: boolean,
): Promise<void> {
  const source = side === "source";
  const rpc = source ? context.source : context.destination;
  const role = source ? "PAYER" : "BUYER";
  const key = source ? "sourceToken" : "settlementToken";
  const spender = source ? campaignContracts.vault.address : campaignContracts.market.address;
  const terms = c5Terms(0n, 2n);
  const amount =
    operation === "approve"
      ? source
        ? terms.sourceFaceValueRaw
        : terms.grossPurchasePriceRaw
      : 0n;
  let before = await allowanceSnapshot(rpc, side);
  checkC5Allowance(operation, side, before, BigInt(Math.floor(Date.now() / 1000)));
  const current = before.allowance;
  const action = `c5-${operation}-${side}`;
  if (current === amount) {
    await recordC5({
      action,
      state: "allowance-already-exact",
      evidenceKind: "live-read-verified",
      amount,
      before,
    });
    return;
  }
  const receipt = await submitC5(
    context,
    action,
    role,
    key,
    "approve",
    [spender, amount],
    broadcast,
    { amount, spender, before },
    async () => {
      before = await allowanceSnapshot(rpc, side);
      checkC5Allowance(operation, side, before, BigInt(Math.floor(Date.now() / 1000)), current);
    },
  );
  if (!receipt) return;
  const after = await allowanceSnapshot(rpc, side, receipt.blockNumber);
  checkC5Allowance(operation, side, after, after.timestamp);
  if (
    after.blockHash !== receipt.blockHash ||
    after.allowance !== amount ||
    after.balance !== before.balance ||
    after.spenderBalance !== before.spenderBalance
  )
    throw new ConfigurationError(
      "C5 mined approval changed balances or differs from exact authorization",
    );
  await recordC5({
    action,
    state: "allowance-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    amount,
    spender,
    before,
    after,
  });
}
