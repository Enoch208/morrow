import type { JsonRpcProvider } from "ethers";
import { applicationInterfaces, applicationRead } from "./manifest-chain.ts";
import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";
import { string } from "./evidence-files.ts";
import type { CampaignManifest, StateRead } from "./manifest-types.ts";
import type { MarketTransitionState } from "./market-transition.ts";

export async function readMarketHistory(
  rpc: JsonRpcProvider,
  manifest: CampaignManifest,
  block: number,
) {
  const actors = [
    string(manifest.terms.seller),
    string(manifest.terms.buyer),
    string(manifest.terms.feeRecipient),
  ];
  const keys = [...new Set(manifest.proofs.map((proof) => proof.eventKey))];
  const reads: StateRead[] = [];
  const query = async (method: string, args: string[] = []) => {
    const read = await applicationRead(rpc, "market", method, args, block);
    reads.push(read);
    return applicationInterfaces.market.decodeFunctionResult(method, read.raw);
  };
  const [saleRead, bound, credits, liabilities, actorReads, consumedReads, balanceRead] =
    await Promise.all([
      query("getSale", [manifest.identity.saleId]),
      query("totalBound"),
      query("totalCredits"),
      query("totalLiabilities"),
      Promise.all(
        actors.map(
          async (actor) => [actor, integer((await query("credits", [actor]))[0])] as const,
        ),
      ),
      Promise.all(
        keys.map(async (key) => {
          const value: unknown = (await query("consumed", [key]))[0];
          if (typeof value !== "boolean") throw new EvidenceError("Invalid consumed flag");
          return [key, value] as const;
        }),
      ),
      applicationRead(
        rpc,
        "settlementToken",
        "balanceOf",
        [string(manifest.terms.destinationMarket)],
        block,
      ),
    ]);
  reads.push(balanceRead);
  const sale = tuple(saleRead[0]);
  const state = integer(sale[1]);
  const terms = tuple(sale[0]);
  if (
    state === 0n &&
    terms
      .toArray()
      .some(
        (value: unknown) => value !== 0n && value !== "0x0000000000000000000000000000000000000000",
      )
  )
    throw new EvidenceError("Absent sale contains unexpected terms");
  const result: MarketTransitionState = {
    saleState: state,
    encodedTerms: state === 0n ? null : referenceIdentity(referenceTerms(terms)).encodedTerms,
    bound: integer(bound[0]),
    credits: integer(credits[0]),
    liabilities: integer(liabilities[0]),
    balance: integer(
      applicationInterfaces.settlementToken.decodeFunctionResult("balanceOf", balanceRead.raw)[0],
    ),
    actorCredits: Object.fromEntries(actorReads),
    consumed: Object.fromEntries(consumedReads),
  };
  return { blockNumber: block, reads, state: result };
}
