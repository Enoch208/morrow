import { applicationInterfaces } from "./manifest-chain.ts";
import { EvidenceError, integer, tuple, pins } from "./checker-rpc.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";
import type { CampaignManifest, DeploymentRole } from "./manifest-types.ts";

export function checkManifestState(manifest: CampaignManifest): void {
  const decoded = (role: DeploymentRole, method: string, args: readonly string[] = []) => {
    const candidates = manifest.snapshots
      .flatMap((snapshot) => snapshot.reads)
      .filter(
        (read) =>
          read.role === role &&
          read.method === method &&
          JSON.stringify(read.args) === JSON.stringify(args),
      );
    const selected = candidates[0];
    if (!selected || candidates.length !== 1)
      throw new EvidenceError("Required unique state read missing");
    return applicationInterfaces[role].decodeFunctionResult(method, selected.raw);
  };
  const claimId = manifest.terms.claimId;
  const roundId = manifest.terms.round;
  if (!claimId || !roundId) throw new EvidenceError("Claim/round identifier missing");
  const claim = tuple(decoded("vault", "getClaim", [claimId])[0]);
  const round = tuple(decoded("vault", "getRound", [claimId, roundId])[0]);
  const sale = tuple(decoded("market", "getSale", [manifest.identity.saleId])[0]);
  const sourceState = integer(round[1]);
  const destinationState = integer(sale[1]);
  const terms = manifest.terms;
  if (
    claim[0] !== terms.sourceToken ||
    integer(claim[1]).toString() !== terms.sourceFaceValueRaw ||
    integer(claim[2]).toString() !== terms.maturity ||
    claim[3] !== terms.seller ||
    claim[4] !== (sourceState === 2n ? terms.buyer : terms.seller) ||
    claim[7] !== (sourceState === 2n) ||
    claim[8] !== manifest.actualOutcome.redeemed ||
    Number(sourceState) !== manifest.actualOutcome.sourceRoundState ||
    Number(destinationState) !== manifest.actualOutcome.destinationState
  )
    throw new EvidenceError("Claim economics, ownership or actual outcome mismatch");
  if (
    referenceIdentity(referenceTerms(tuple(round[0]))).termsHash !== manifest.identity.termsHash ||
    round[2] !== manifest.identity.saleId ||
    round[3] !== manifest.identity.termsHash ||
    referenceIdentity(referenceTerms(tuple(sale[0]))).termsHash !== manifest.identity.termsHash
  )
    throw new EvidenceError("Stored source/destination canonical terms mismatch");
  if (
    (destinationState === 2n && sourceState !== 2n) ||
    (destinationState === 3n && sourceState !== 3n)
  )
    throw new EvidenceError("Destination terminal outcome contradicts source");
  const backing = integer(decoded("vault", "totalBacking")[0]);
  const sourceBalance = integer(decoded("sourceToken", "balanceOf", [pins.vault])[0]);
  const bound = integer(decoded("market", "totalBound")[0]);
  const credits = integer(decoded("market", "totalCredits")[0]);
  const liabilities = integer(decoded("market", "totalLiabilities")[0]);
  const destinationBalance = integer(decoded("settlementToken", "balanceOf", [pins.market])[0]);
  if (
    sourceBalance < backing ||
    bound + credits !== liabilities ||
    destinationBalance < liabilities
  )
    throw new EvidenceError("Manifest snapshots have uncovered obligations");
  if (
    integer(decoded("sourceToken", "decimals")[0]) !== 6n ||
    integer(decoded("settlementToken", "decimals")[0]) !== 6n
  )
    throw new EvidenceError("Token units differ from manifest");
}
