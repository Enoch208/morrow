import type { JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { marketAccounting } from "./campaign-accounting.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { decodedInteger, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { encodeTerms, quoteEconomics, saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

type Accounting = Awaited<ReturnType<typeof marketAccounting>>;
export type C5Allocation = "fund" | "settle" | "refund";

export function assertC5Admission(terms: SaleTerms, timestamp: bigint, now: bigint): void {
  if (terms.round !== 2n) throw new ConfigurationError("C5 funds only round 2");
  if (now - timestamp > 120n || timestamp - now > 30n)
    throw new ConfigurationError("C5 chain timestamp is stale or inconsistent");
  if (timestamp + 600n >= terms.fundBefore || now + 600n >= terms.fundBefore)
    throw new ConfigurationError("C5 funding requires a ten-minute admission buffer");
}

export function assertC5Accounting(
  before: Accounting,
  after: Accounting,
  terms: SaleTerms,
  operation: C5Allocation,
): void {
  const price = terms.grossPurchasePriceRaw;
  const { feeRaw, sellerNetRaw } = quoteEconomics(price, terms.feeBps);
  const expected = { ...before };
  if (operation === "fund") {
    expected.bound += price;
    expected.liabilities += price;
    expected.balance += price;
    expected.buyerBalance -= price;
  } else {
    expected.bound -= price;
    expected.credits += price;
    expected.payerCredit += operation === "settle" ? feeRaw : 0n;
    expected.sellerCredit += operation === "settle" ? sellerNetRaw : 0n;
    expected.buyerCredit += operation === "refund" ? price : 0n;
  }
  for (const key of Object.keys(expected) as (keyof Accounting)[])
    if (after[key] !== expected[key])
      throw new ConfigurationError(`C5 ${operation} accounting mismatch: ${key}`);
}

export function assertC5Withdrawal(
  before: Accounting,
  after: Accounting,
  recipient: "seller" | "fee" | "buyer",
  amount: bigint,
): void {
  const creditKey =
    recipient === "seller" ? "sellerCredit" : recipient === "fee" ? "payerCredit" : "buyerCredit";
  const balanceKey =
    recipient === "seller"
      ? "sellerBalance"
      : recipient === "fee"
        ? "payerBalance"
        : "buyerBalance";
  if (amount <= 0n || before[creditKey] !== amount)
    throw new ConfigurationError("C5 withdrawal must match complete approved entitlement");
  const expected = {
    ...before,
    [creditKey]: 0n,
    [balanceKey]: before[balanceKey] + amount,
    credits: before.credits - amount,
    liabilities: before.liabilities - amount,
    balance: before.balance - amount,
  };
  for (const key of Object.keys(expected) as (keyof Accounting)[])
    if (after[key] !== expected[key])
      throw new ConfigurationError(`C5 withdrawal accounting mismatch: ${key}`);
}

export async function c5DestinationSnapshot(
  rpc: JsonRpcProvider,
  terms: SaleTerms,
  eventKey: string,
  tag: number | "latest" | "finalized" = "latest",
) {
  const block = await rpc.getBlock(tag);
  if (!block?.hash) throw new ConfigurationError("C5 destination block unavailable");
  await Promise.all([
    verifyCampaignContract(rpc, "market", block.number),
    verifyCampaignContract(rpc, "settlementToken", block.number),
  ]);
  const [accounting, sale, consumed] = await Promise.all([
    marketAccounting(rpc, block.number),
    campaignRead(rpc, "market", "getSale", [saleIdentity(terms).saleId], block.number),
    campaignRead(rpc, "market", "consumed", [eventKey], block.number),
  ]);
  const tuple = decodedTuple(sale.decoded[0], 2);
  const state = decodedInteger(tuple[1]);
  if (state !== 0n && encodeTerms(decodedTerms(tuple[0])) !== encodeTerms(terms))
    throw new ConfigurationError("C5 destination canonical terms mismatch");
  if (typeof consumed.decoded[0] !== "boolean")
    throw new ConfigurationError("C5 consumed flag unavailable");
  if ((await rpc.getBlock(block.number))?.hash !== block.hash)
    throw new ConfigurationError("C5 destination snapshot reorganized");
  return {
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: BigInt(block.timestamp),
    state,
    consumed: consumed.decoded[0],
    accounting,
    saleRaw: sale.raw,
    consumedRaw: consumed.raw,
  };
}
