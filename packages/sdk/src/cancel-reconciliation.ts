import type { Claim, SaleTerms } from "@morrow/protocol";
import { ConfigurationError } from "./environment.ts";

export function assertCancelledTransition(
  terms: SaleTerms,
  before: Claim,
  after: Claim,
  roundState: bigint,
  balanceBefore: bigint,
  balanceAfter: bigint,
  backingBefore: bigint,
  backingAfter: bigint,
): void {
  for (const claim of [before, after]) {
    if (
      claim.claimId !== terms.claimId ||
      claim.sourceToken !== terms.sourceToken ||
      claim.sourceFaceValueRaw !== terms.sourceFaceValueRaw ||
      claim.maturity !== terms.maturity ||
      claim.currentBeneficiary !== terms.seller ||
      claim.originalBeneficiary !== terms.seller ||
      claim.latestRound !== terms.round ||
      claim.successfulSale ||
      claim.redeemed
    )
      throw new ConfigurationError("Cancellation reconciliation claim mismatch");
  }
  if (
    before.activeRound !== terms.round ||
    after.activeRound !== 0n ||
    roundState !== 3n ||
    before.referenceHash !== after.referenceHash ||
    balanceBefore !== balanceAfter ||
    backingBefore !== backingAfter ||
    backingAfter < terms.sourceFaceValueRaw
  )
    throw new ConfigurationError("Cancellation reconciliation transition or backing mismatch");
}
