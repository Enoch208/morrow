import { EvidenceError } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import type { SourceClaimState, SourceRoundState, SourceState } from "./source-state.ts";

function exactClaim(actual: SourceClaimState, expected: SourceClaimState): void {
  for (const key of Object.keys(expected) as (keyof SourceClaimState)[])
    if (actual[key] !== expected[key])
      throw new EvidenceError(`Source claim ${key} transition mismatch`);
}

function exactRound(actual: SourceRoundState | null, expected: SourceRoundState | null): void {
  if (!actual || !expected) {
    if (actual !== expected) throw new EvidenceError("Unexpected source round existence");
    return;
  }
  for (const key of Object.keys(expected) as (keyof SourceRoundState)[])
    if (actual[key] !== expected[key])
      throw new EvidenceError(`Source round ${key} transition mismatch`);
}

export function assertSourceTransition(
  operation: string,
  sender: string,
  timestamp: bigint,
  manifest: CampaignManifest,
  before: SourceState,
  after: SourceState,
  creationReference?: string,
) {
  const terms = manifest.terms,
    claim = before.claim;
  const face = BigInt(string(terms.sourceFaceValueRaw)),
    maturity = BigInt(string(terms.maturity)),
    roundId = BigInt(string(terms.round)),
    deadline = BigInt(string(terms.assignBefore));
  const seller = string(terms.seller),
    buyer = string(terms.buyer);
  const committedRound = (state: bigint): SourceRoundState => ({
    state,
    encodedTerms: manifest.identity.encodedTerms,
    saleId: manifest.identity.saleId,
    termsHash: manifest.identity.termsHash,
  });
  if (!after.claim) throw new EvidenceError("Successful source transition lost its claim");
  for (const value of [claim, after.claim]) {
    if (
      value &&
      (value.token !== terms.sourceToken ||
        value.face !== face ||
        value.maturity !== maturity ||
        value.originalBeneficiary !== seller)
    )
      throw new EvidenceError("Source claim differs from canonical immutable terms");
  }
  let expected: SourceClaimState;
  if (operation === "create") {
    if (
      claim !== null ||
      sender !== terms.feeRecipient ||
      timestamp >= maturity ||
      !creationReference
    )
      throw new EvidenceError("Invalid historical source creation");
    expected = {
      token: string(terms.sourceToken),
      face,
      maturity,
      originalBeneficiary: seller,
      currentBeneficiary: seller,
      activeRound: 0n,
      latestRound: 0n,
      successfulSale: false,
      redeemed: false,
      referenceHash: creationReference,
    };
    exactRound(before.round, null);
    exactRound(after.round, null);
  } else {
    if (!claim || claim.redeemed)
      throw new EvidenceError("Source transition requires an existing unredeemed claim");
    expected = { ...claim };
    if (operation === "reserve") {
      if (
        sender !== seller ||
        claim.currentBeneficiary !== seller ||
        claim.successfulSale ||
        claim.activeRound !== 0n ||
        claim.latestRound + 1n !== roundId ||
        timestamp >= maturity ||
        timestamp >= deadline
      )
        throw new EvidenceError("Invalid historical source reservation");
      expected = { ...claim, activeRound: roundId, latestRound: roundId };
      exactRound(before.round, null);
      exactRound(after.round, committedRound(1n));
    } else if (operation === "assign" || operation === "cancel") {
      if (
        claim.currentBeneficiary !== seller ||
        claim.successfulSale ||
        claim.activeRound !== roundId ||
        claim.latestRound !== roundId
      )
        throw new EvidenceError("Source outcome lacks its exact active round");
      exactRound(before.round, committedRound(1n));
      if (operation === "assign") {
        if (sender !== seller || timestamp >= deadline)
          throw new EvidenceError("Historical assignment signer or deadline mismatch");
        expected = { ...claim, activeRound: 0n, currentBeneficiary: buyer, successfulSale: true };
        exactRound(after.round, committedRound(2n));
      } else {
        if (timestamp < deadline)
          throw new EvidenceError("Historical cancellation preceded deadline");
        expected = { ...claim, activeRound: 0n };
        exactRound(after.round, committedRound(3n));
      }
    } else if (operation === "redeem") {
      const assigned = manifest.campaignId === "a";
      if (
        timestamp < maturity ||
        claim.activeRound !== 0n ||
        claim.latestRound !== roundId ||
        claim.successfulSale !== assigned ||
        claim.currentBeneficiary !== (assigned ? buyer : seller)
      )
        throw new EvidenceError("Historical redemption timing or beneficiary mismatch");
      exactRound(before.round, committedRound(assigned ? 2n : 3n));
      exactRound(after.round, before.round);
      expected = { ...claim, redeemed: true };
    } else throw new EvidenceError("Unsupported source transition");
  }
  exactClaim(after.claim, expected);
  return {
    operation,
    claimId: string(terms.claimId),
    round: roundId,
    facePaid: operation === "redeem" ? face : 0n,
    previousRoundState: before.round?.state ?? 0n,
    nextRoundState: after.round?.state ?? 0n,
  };
}
