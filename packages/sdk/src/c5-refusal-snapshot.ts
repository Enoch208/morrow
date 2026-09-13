import { toQuantity } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { decodedInteger, decodedTerms, decodedTuple } from "./decoded-state.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { sourceSnapshot } from "./c5-source-io.ts";
import type { C5Context } from "./c5-submit.ts";
import { ConfigurationError } from "./errors.ts";
import { json } from "./campaign-log.ts";

export interface C5RefusalBlocks {
  source: { number: number; hash: string };
  destination: { number: number; hash: string };
}

export async function c5RefusalSnapshot(
  context: C5Context,
  blocks: C5RefusalBlocks,
  terms: readonly [SaleTerms, SaleTerms],
  eventKeys: readonly [string, string, string],
) {
  await Promise.all(
    Object.entries(campaignContracts).map(([key, pin]) => {
      const side = pin.chainId === 11155111n ? "source" : "destination";
      return verifyCampaignContract(
        context[side],
        key as keyof typeof campaignContracts,
        blocks[side].number,
      );
    }),
  );
  const read = (
    kind: "market" | "settlementToken",
    method: string,
    args: readonly unknown[] = [],
  ) => campaignRead(context.destination, kind, method, args, blocks.destination.number);
  const [source, sales, consumption, totals, balances, credits] = await Promise.all([
    sourceSnapshot(context, blocks.source.number, terms[0].claimId),
    Promise.all(terms.map((entry) => read("market", "getSale", [saleIdentity(entry).saleId]))),
    Promise.all(eventKeys.map((key) => read("market", "consumed", [key]))),
    Promise.all(
      ["totalBound", "totalCredits", "totalLiabilities"].map((method) => read("market", method)),
    ),
    Promise.all(
      [campaignContracts.market.address, ...Object.values(campaignActors)].map((address) =>
        read("settlementToken", "balanceOf", [address]),
      ),
    ),
    Promise.all(
      Object.values(campaignActors).map((address) => read("market", "credits", [address])),
    ),
  ]);
  for (const side of ["source", "destination"] as const) {
    const block: unknown = await context[side].send("eth_getBlockByNumber", [
      toQuantity(blocks[side].number),
      false,
    ]);
    if (
      !block ||
      typeof block !== "object" ||
      !("hash" in block) ||
      block.hash !== blocks[side].hash
    )
      throw new ConfigurationError(`C5 refusal ${side} snapshot reorganized`);
  }
  return { blocks, source, sales, consumption, totals, balances, credits };
}

export type C5RefusalSnapshot = Awaited<ReturnType<typeof c5RefusalSnapshot>>;

export function assertC5RefusalState(
  snapshot: C5RefusalSnapshot,
  terms: readonly [SaleTerms, SaleTerms],
): void {
  const source = snapshot.source.snapshot;
  const claim = source.claim;
  if (
    claim?.claimId !== terms[1].claimId ||
    claim.currentBeneficiary !== terms[1].buyer ||
    !claim.successfulSale ||
    claim.redeemed ||
    claim.activeRound !== 0n ||
    claim.sourceToken !== terms[1].sourceToken ||
    claim.sourceFaceValueRaw !== terms[1].sourceFaceValueRaw ||
    claim.maturity !== terms[1].maturity ||
    source.backing < claim.sourceFaceValueRaw ||
    source.balances.vault < source.backing
  )
    throw new ConfigurationError("C5 refusal source claim or backing mismatch");
  for (const index of [0, 1] as const) {
    const round = source.rounds[index];
    const identity = saleIdentity(terms[index]);
    if (
      round?.state !== (index === 0 ? 3n : 2n) ||
      encodeTerms(round.terms) !== encodeTerms(terms[index]) ||
      round.saleId !== identity.saleId ||
      round.termsHash !== identity.termsHash
    )
      throw new ConfigurationError("C5 refusal requires cancelled round 1 and assigned round 2");
    const sale = decodedTuple(snapshot.sales[index]?.decoded[0], 2);
    if (
      decodedInteger(sale[1]) !== (index === 0 ? 0n : 1n) ||
      (index === 1 && encodeTerms(decodedTerms(sale[0])) !== encodeTerms(terms[1]))
    )
      throw new ConfigurationError("C5 refusal requires absent round 1 and exact BOUND round 2");
  }
  if (
    json(snapshot.consumption.map((read) => read.decoded[0] as unknown)) !==
    json([false, true, false])
  )
    throw new ConfigurationError("C5 refusal proof consumption mismatch");
  const [bound, credits, liabilities] = snapshot.totals.map((read) =>
    decodedInteger(read.decoded[0]),
  );
  if (
    bound === undefined ||
    credits === undefined ||
    liabilities === undefined ||
    bound < terms[1].grossPurchasePriceRaw ||
    bound + credits !== liabilities ||
    decodedInteger(snapshot.balances[0]?.decoded[0]) < liabilities ||
    snapshot.credits.reduce((sum, read) => sum + decodedInteger(read.decoded[0]), 0n) !== credits
  )
    throw new ConfigurationError("C5 refusal destination accounting mismatch");
}

export function assertC5RefusalUnchanged(
  before: C5RefusalSnapshot,
  after: C5RefusalSnapshot,
): void {
  if (json(before) !== json(after)) throw new ConfigurationError("C5 refusal snapshot changed");
}
