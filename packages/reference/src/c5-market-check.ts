import type { JsonRpcProvider } from "ethers";
import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { c5Actors, c5ReferenceTerms } from "./c5-policy.ts";
import { referenceEconomics, referenceIdentity, referenceTerms } from "./index.ts";
import { c5ReadMarket, c5IsolatedTransaction } from "./c5-chain.ts";
import { applicationPins, applicationInterfaces } from "./manifest-chain.ts";
import type { c5Transaction } from "./c5-receipts.ts";
import type { checkC5Proof } from "./c5-proof-check.ts";

type Snapshot = Awaited<ReturnType<typeof c5ReadMarket>>;

export function c5MarketState(snapshot: Snapshot, claimId: string, keys: readonly string[]) {
  const query = (method: string, args: readonly string[] = []) => {
    const found = snapshot.reads.find(
      (item) => item.method === method && JSON.stringify(item.args) === JSON.stringify(args),
    );
    if (!found) throw new EvidenceError("Missing C5 market raw read");
    return found.decoded[0] as unknown;
  };
  const sales = ["1", "2"].map((round) => {
    const terms = c5ReferenceTerms(claimId, round),
      identity = referenceIdentity(terms);
    const sale = tuple(query("getSale", [identity.saleId]));
    const state = integer(sale[1]);
    if (
      state !== 0n &&
      referenceIdentity(referenceTerms(tuple(sale[0]))).encodedTerms !== identity.encodedTerms
    )
      throw new EvidenceError("C5 stored destination terms mismatch");
    return state;
  });
  if (sales[0] !== 0n) throw new EvidenceError("C5 first round must never be destination funded");
  const value = (method: string, args: string[] = []) => integer(query(method, args));
  const bound = value("totalBound"),
    credits = value("totalCredits"),
    liabilities = value("totalLiabilities");
  const balance = value("balanceOf", [applicationPins.market.address]);
  if (liabilities !== bound + credits || balance < liabilities)
    throw new EvidenceError("C5 destination obligations uncovered");
  const actorCredits = Object.fromEntries(
    Object.values(c5Actors).map((actor) => [actor, value("credits", [actor])]),
  );
  const actorBalances = Object.fromEntries(
    Object.values(c5Actors).map((actor) => [actor, value("balanceOf", [actor])]),
  );
  const consumed = Object.fromEntries(
    keys.map((key) => {
      const flag = query("consumed", [key]);
      if (typeof flag !== "boolean") throw new EvidenceError("C5 invalid consumption flag");
      return [key, flag];
    }),
  );
  return {
    saleState: sales[1],
    bound,
    credits,
    liabilities,
    balance,
    actorCredits,
    actorBalances,
    consumed,
  };
}

export function assertC5MarketHistory(
  action: string,
  before: ReturnType<typeof c5MarketState>,
  after: ReturnType<typeof c5MarketState>,
  key: string | null,
) {
  const price = 9410000n,
    economics = referenceEconomics("9410000", "50");
  const expected = {
    ...before,
    actorCredits: { ...before.actorCredits },
    actorBalances: { ...before.actorBalances },
    consumed: { ...before.consumed },
  };
  let payment = null;
  if (action === "c5-r2-fund") {
    if (before.saleState !== 0n) throw new EvidenceError("C5 funding must start absent");
    expected.saleState = 1n;
    expected.bound += price;
    expected.liabilities += price;
    expected.balance += price;
    expected.actorBalances[c5Actors.buyer] = (before.actorBalances[c5Actors.buyer] ?? -1n) - price;
    payment = { from: c5Actors.buyer, to: applicationPins.market.address, amount: price };
  } else if (action === "c5-r2-settle" || action === "c5-r2-refund") {
    if (before.saleState !== 1n) throw new EvidenceError("C5 outcome must start BOUND");
    const assigned = action.endsWith("-settle");
    expected.saleState = assigned ? 2n : 3n;
    expected.bound -= price;
    expected.credits += price;
    for (const [actor, amount] of assigned
      ? ([
          [c5Actors.seller, BigInt(economics.sellerNetRaw)],
          [c5Actors.payer, BigInt(economics.feeRaw)],
        ] as const)
      : ([[c5Actors.buyer, price]] as const))
      expected.actorCredits[actor] = (before.actorCredits[actor] ?? -1n) + amount;
  } else {
    const actor =
      action === "c5-withdraw-seller"
        ? c5Actors.seller
        : action === "c5-withdraw-fee"
          ? c5Actors.payer
          : action === "c5-withdraw-buyer"
            ? c5Actors.buyer
            : null;
    if (!actor || before.saleState !== (actor === c5Actors.buyer ? 3n : 2n))
      throw new EvidenceError("C5 withdrawal lacks terminal outcome");
    const amount = BigInt(
      actor === c5Actors.buyer
        ? "9410000"
        : actor === c5Actors.seller
          ? economics.sellerNetRaw
          : economics.feeRaw,
    );
    if (before.actorCredits[actor] !== amount)
      throw new EvidenceError("C5 withdrawal amount is not exact entitlement");
    expected.actorCredits[actor] = 0n;
    expected.actorBalances[actor] = (before.actorBalances[actor] ?? -1n) + amount;
    expected.credits -= amount;
    expected.liabilities -= amount;
    expected.balance -= amount;
    payment = { from: applicationPins.market.address, to: actor, amount };
  }
  if (key !== null) {
    if (before.consumed[key] !== false) throw new EvidenceError("C5 event already consumed");
    expected.consumed[key] = true;
  } else if (!action.startsWith("c5-withdraw-"))
    throw new EvidenceError("C5 action lacks authenticated proof identity");
  const plain = (value: unknown) =>
    JSON.stringify(value, (_, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  if (plain(after) !== plain(expected))
    throw new EvidenceError(
      "C5 market allocation, recipient, balance or consumption delta mismatch",
    );
  return { action, payment, before, after };
}

export async function checkC5Market(
  rpc: JsonRpcProvider,
  action: string,
  claimId: string,
  actual: Awaited<ReturnType<typeof c5Transaction>>,
  proof: Awaited<ReturnType<typeof checkC5Proof>> | null,
  keys: readonly string[],
) {
  const { receipt, call } = actual;
  await c5IsolatedTransaction(rpc, receipt, applicationPins.market.address);
  if (proof) {
    const native: unknown = actual.call.args[0];
    if (
      applicationInterfaces.market.encodeFunctionData(call.name, [
        proof.envelope,
        proof.receiptLocalLogIndex,
        call.args[2],
      ]) !== actual.transaction.data ||
      !native ||
      (action === "c5-r2-fund" && actual.block.timestamp >= 1789299900)
    )
      throw new EvidenceError("C5 market calldata proof envelope or admission timestamp mismatch");
  }
  const saleIds = ["1", "2"].map(
    (round) => referenceIdentity(c5ReferenceTerms(claimId, round)).saleId,
  );
  const [before, after] = await Promise.all([
    c5ReadMarket(rpc, saleIds, keys, receipt.blockNumber - 1),
    c5ReadMarket(rpc, saleIds, keys, receipt.blockNumber),
  ]);
  return {
    ...assertC5MarketHistory(
      action,
      c5MarketState(before, claimId, keys),
      c5MarketState(after, claimId, keys),
      proof?.eventKey ?? null,
    ),
    beforeRaw: before,
    afterRaw: after,
  };
}
