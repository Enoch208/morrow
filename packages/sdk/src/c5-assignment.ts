import { campaignActors } from "./campaign-config.ts";
import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Record, recordC5 } from "./c5-log.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import { prepareAssignment } from "./preflight.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { encodeTerms } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export async function c5Assignment(context: C5Context, broadcast: boolean): Promise<void> {
  const terms = c5Terms(await c5ClaimId(), 2n);
  const funding = await c5Record("c5-r2-fund", "bound-verified");
  if (
    typeof funding.transactionHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(funding.transactionHash)
  )
    throw new ConfigurationError("C5 funding transaction hash unavailable");
  const readers = livePreflightReaders(
    context.source,
    context.destination,
    terms,
    funding.transactionHash,
  );
  const prepare = async () => {
    const result = await prepareAssignment(terms, campaignActors.SELLER, 11155111n, readers);
    await recordC5({
      action: "c5-r2-assign",
      state: "preflight-verified",
      evidenceKind: "live-read-verified",
      terms,
      ...result,
    });
    return result;
  };
  const prepared = await prepare();
  const receipt = await submitC5(
    context,
    "c5-r2-assign",
    "SELLER",
    "vault",
    "assignSale",
    [terms.claimId, terms.round, prepared.termsHash],
    broadcast,
    { terms, preflight: prepared },
    async () => {
      const fresh = await prepare();
      if (fresh.data !== prepared.data || fresh.chainId !== prepared.chainId)
        throw new ConfigurationError("C5 assignment calldata changed after preflight");
    },
  );
  if (!receipt) return;
  const after = await readers.source();
  if (
    after.state !== 2n ||
    after.activeRound !== 0n ||
    after.beneficiary !== terms.buyer ||
    !after.successfulSale ||
    after.saleId !== prepared.saleId ||
    after.termsHash !== prepared.termsHash ||
    encodeTerms(after.terms) !== encodeTerms(terms) ||
    after.blockNumber < receipt.blockNumber ||
    (await context.source.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash
  )
    throw new ConfigurationError("C5 source assignment post-state mismatch");
  await recordC5({
    action: "c5-r2-assign",
    state: "assignment-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    terms,
    preflight: prepared,
    after,
  });
}
