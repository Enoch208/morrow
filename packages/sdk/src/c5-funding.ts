import { campaignContracts } from "./campaign-config.ts";
import { campaignRead } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { c5ClaimId, recordC5 } from "./c5-log.ts";
import { c5Terms } from "./c5-config.ts";
import { loadC5Proof } from "./c5-proof.ts";
import { submitC5 } from "./c5-submit.ts";
import type { C5Context } from "./c5-submit.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { verifyC5Envelope } from "./c5-proof-validation.ts";
import {
  assertC5Accounting,
  assertC5Admission,
  c5DestinationSnapshot,
} from "./c5-destination-checks.ts";
import { ConfigurationError } from "./errors.ts";
import { withC5FundingAdmission } from "./c5-signing-window.ts";

export async function c5Funding(context: C5Context, broadcast: boolean): Promise<void> {
  const terms = c5Terms(await c5ClaimId(), 2n);
  const cancellation = await loadC5Proof(context.source, context.destination, 1n, "cancel");
  const bundle = await loadC5Proof(context.source, context.destination, 2n, "reserve");
  if (
    encodeTerms(bundle.terms) !== encodeTerms(terms) ||
    cancellation.terms.claimId !== terms.claimId
  )
    throw new ConfigurationError("C5 funding proof terms mismatch");
  const readers = livePreflightReaders(context.source, context.destination, terms, "");
  const check = async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const source = await readers.source();
    assertC5Admission(terms, source.timestamp, now);
    const identity = saleIdentity(terms);
    if (
      source.state !== 1n ||
      source.activeRound !== 2n ||
      source.beneficiary !== terms.seller ||
      source.redeemed ||
      source.successfulSale ||
      source.faceValueRaw !== terms.sourceFaceValueRaw ||
      source.maturity !== terms.maturity ||
      source.sourceToken !== terms.sourceToken ||
      source.totalBacking < terms.sourceFaceValueRaw ||
      source.vaultBalance < source.totalBacking ||
      source.saleId !== identity.saleId ||
      source.termsHash !== identity.termsHash ||
      encodeTerms(source.terms) !== encodeTerms(terms)
    )
      throw new ConfigurationError("C5 exact source round 2 is not available");
    const finalized = await context.destination.getBlock("finalized");
    if (!finalized?.hash) throw new ConfigurationError("C5 finalized destination unavailable");
    assertC5Admission(terms, BigInt(finalized.timestamp), BigInt(Math.floor(Date.now() / 1000)));
    const snapshot = await c5DestinationSnapshot(context.destination, terms, bundle.eventKey);
    assertC5Admission(terms, snapshot.timestamp, BigInt(Math.floor(Date.now() / 1000)));
    const allowance = await campaignRead(
      context.destination,
      "settlementToken",
      "allowance",
      [terms.buyer, campaignContracts.market.address],
      snapshot.blockNumber,
    );
    if (
      snapshot.state !== 0n ||
      snapshot.consumed ||
      snapshot.accounting.buyerBalance < terms.grossPurchasePriceRaw ||
      decodedInteger(allowance.decoded[0]) !== terms.grossPurchasePriceRaw
    )
      throw new ConfigurationError(
        "C5 sale, consumption, balance or exact allowance blocks funding",
      );
    await withC5FundingAdmission(
      terms,
      [source.timestamp, BigInt(finalized.timestamp), snapshot.timestamp],
      async () => {
        await verifyC5Envelope(
          context.source,
          context.destination,
          cancellation.proof,
          cancellation.sourceReceipt,
          cancellation.terms,
          "cancel",
        );
        await verifyC5Envelope(
          context.source,
          context.destination,
          bundle.proof,
          bundle.sourceReceipt,
          terms,
          "reserve",
        );
      },
    );
    return snapshot;
  };
  let before = await check();
  const receipt = await submitC5(
    context,
    "c5-r2-fund",
    "BUYER",
    "market",
    "fundReservation",
    [bundle.proof, bundle.logIndex, terms],
    broadcast,
    {
      terms,
      ...bundle.identity,
      proofPath: bundle.proofPath,
      proofHash: bundle.proofHash,
      eventKey: bundle.eventKey,
      before,
    },
    async () => {
      before = await check();
    },
  );
  if (!receipt) return;
  const after = await c5DestinationSnapshot(
    context.destination,
    terms,
    bundle.eventKey,
    receipt.blockNumber,
  );
  if (after.state !== 1n || !after.consumed || after.blockHash !== receipt.blockHash)
    throw new ConfigurationError("C5 mined funding is not exact canonical BOUND");
  assertC5Accounting(before.accounting, after.accounting, terms, "fund");
  await recordC5({
    action: "c5-r2-fund",
    state: "bound-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    terms,
    ...bundle.identity,
    proofPath: bundle.proofPath,
    proofHash: bundle.proofHash,
    eventKey: bundle.eventKey,
    before,
    after,
  });
}
