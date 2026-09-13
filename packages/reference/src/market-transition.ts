import { EvidenceError } from "./checker-rpc.ts";
import { referenceEconomics } from "./index.ts";
import { string } from "./evidence-files.ts";
import type { CampaignManifest } from "./manifest-types.ts";

export interface MarketTransitionState {
  readonly saleState: bigint;
  readonly encodedTerms: string | null;
  readonly bound: bigint;
  readonly credits: bigint;
  readonly liabilities: bigint;
  readonly balance: bigint;
  readonly actorCredits: Readonly<Record<string, bigint>>;
  readonly consumed: Readonly<Record<string, boolean>>;
}

export function assertMarketTransition(
  operation: string,
  sender: string,
  manifest: CampaignManifest,
  before: MarketTransitionState,
  after: MarketTransitionState,
  eventKey: string | null,
) {
  const terms = manifest.terms;
  const seller = string(terms.seller),
    buyer = string(terms.buyer),
    recipient = string(terms.feeRecipient);
  const economics = referenceEconomics(string(terms.grossPurchasePriceRaw), string(terms.feeBps));
  const price = BigInt(economics.grossPurchasePriceRaw),
    fee = BigInt(economics.feeRaw),
    net = BigInt(economics.sellerNetRaw);
  const allocation: Record<string, bigint> = { [seller]: 0n, [buyer]: 0n, [recipient]: 0n };
  let previous = 1n,
    next = 1n,
    bound = 0n,
    credits = 0n,
    balance = 0n,
    liabilities = 0n;
  if (operation === "fund") {
    if (sender !== buyer) throw new EvidenceError("Funding has wrong actor");
    previous = 0n;
    bound = price;
    balance = price;
    liabilities = price;
  } else if (operation === "settle" || operation === "refund") {
    next = operation === "settle" ? 2n : 3n;
    bound = -price;
    credits = price;
    if (operation === "settle") {
      allocation[seller] = net;
      allocation[recipient] = fee;
    } else allocation[buyer] = price;
  } else if (operation === "withdraw" || operation === "withdraw-fee") {
    previous = manifest.campaignId === "a" ? 2n : 3n;
    next = previous;
    const actor =
      operation === "withdraw-fee" ? recipient : manifest.campaignId === "a" ? seller : buyer;
    const amount = operation === "withdraw-fee" ? fee : manifest.campaignId === "a" ? net : price;
    if (sender !== actor || before.actorCredits[actor] !== amount || amount <= 0n)
      throw new EvidenceError("Withdrawal does not match the recipient's entire expected credit");
    allocation[actor] = -amount;
    credits = -amount;
    balance = -amount;
    liabilities = -amount;
  } else throw new EvidenceError("Unsupported market transition");
  if (
    before.saleState !== previous ||
    after.saleState !== next ||
    before.encodedTerms !== (operation === "fund" ? null : manifest.identity.encodedTerms) ||
    after.encodedTerms !== manifest.identity.encodedTerms
  )
    throw new EvidenceError("Historical sale state or canonical terms mismatch");
  for (const state of [before, after]) {
    if (
      state.bound < 0n ||
      state.credits < 0n ||
      state.liabilities !== state.bound + state.credits ||
      state.balance < state.liabilities ||
      Object.values(state.actorCredits).reduce((sum, value) => sum + value, 0n) > state.credits ||
      Object.values(state.actorCredits).some((value) => value < 0n)
    )
      throw new EvidenceError("Historical accounting has uncovered obligations");
  }
  for (const [field, delta] of Object.entries({ bound, credits, balance, liabilities })) {
    const key = field as "bound" | "credits" | "balance" | "liabilities";
    if (after[key] !== before[key] + delta)
      throw new EvidenceError(`Historical ${field} delta mismatch`);
  }
  for (const actor of new Set([
    ...Object.keys(before.actorCredits),
    ...Object.keys(after.actorCredits),
    seller,
    buyer,
    recipient,
  ])) {
    const start = before.actorCredits[actor],
      end = after.actorCredits[actor];
    if (start === undefined || end === undefined || end !== start + (allocation[actor] ?? 0n))
      throw new EvidenceError("Historical recipient credit delta mismatch");
  }
  if ((eventKey !== null) !== ["fund", "settle", "refund"].includes(operation))
    throw new EvidenceError("Transition proof identity missing or unexpected");
  if (
    eventKey !== null &&
    (before.consumed[eventKey] !== false || after.consumed[eventKey] !== true)
  )
    throw new EvidenceError("Authentic event was not consumed exactly once");
  for (const key of new Set([...Object.keys(before.consumed), ...Object.keys(after.consumed)])) {
    if (
      key !== eventKey &&
      (before.consumed[key] === undefined || before.consumed[key] !== after.consumed[key])
    )
      throw new EvidenceError("Unrelated proof consumption changed");
  }
  return {
    operation,
    previousState: previous,
    nextState: next,
    deltas: { bound, credits, liabilities, balance },
    allocation,
    eventKey,
  };
}
