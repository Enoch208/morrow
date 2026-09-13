import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";

export interface SourceClaimState {
  readonly token: string;
  readonly face: bigint;
  readonly maturity: bigint;
  readonly originalBeneficiary: string;
  readonly currentBeneficiary: string;
  readonly activeRound: bigint;
  readonly latestRound: bigint;
  readonly successfulSale: boolean;
  readonly redeemed: boolean;
  readonly referenceHash: string;
}

export interface SourceRoundState {
  readonly state: bigint;
  readonly encodedTerms: string;
  readonly saleId: string;
  readonly termsHash: string;
}

export interface SourceState {
  readonly claim: SourceClaimState | null;
  readonly round: SourceRoundState | null;
}

export function sourceClaim(value: unknown): SourceClaimState {
  const claim = tuple(value);
  if (claim.length !== 10 || typeof claim[7] !== "boolean" || typeof claim[8] !== "boolean")
    throw new EvidenceError("Invalid source claim tuple");
  return {
    token: string(claim[0]),
    face: integer(claim[1]),
    maturity: integer(claim[2]),
    originalBeneficiary: string(claim[3]),
    currentBeneficiary: string(claim[4]),
    activeRound: integer(claim[5]),
    latestRound: integer(claim[6]),
    successfulSale: claim[7],
    redeemed: claim[8],
    referenceHash: string(claim[9]),
  };
}

export function sourceRound(value: unknown): SourceRoundState | null {
  const round = tuple(value),
    terms = tuple(round[0]);
  if (round.length !== 4) throw new EvidenceError("Invalid source round tuple");
  const state = integer(round[1]);
  if (state === 0n) {
    if (
      terms
        .toArray()
        .some(
          (item: unknown) => item !== 0n && item !== "0x0000000000000000000000000000000000000000",
        ) ||
      round[2] !== "0x" + "00".repeat(32) ||
      round[3] !== "0x" + "00".repeat(32)
    )
      throw new EvidenceError("Absent source round has populated fields");
    return null;
  }
  return {
    state,
    encodedTerms: referenceIdentity(referenceTerms(terms)).encodedTerms,
    saleId: string(round[2]),
    termsHash: string(round[3]),
  };
}
