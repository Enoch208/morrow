import type { Address, Hash, SaleIdentity, SaleTerms } from "./terms.ts";
import type { DestinationState, SourceRoundState } from "./states.ts";

export interface Claim {
  readonly claimId: bigint;
  readonly sourceToken: Address;
  readonly sourceFaceValueRaw: bigint;
  readonly maturity: bigint;
  readonly originalBeneficiary: Address;
  readonly currentBeneficiary: Address;
  readonly activeRound: bigint;
  readonly latestRound: bigint;
  readonly successfulSale: boolean;
  readonly redeemed: boolean;
  readonly referenceHash: Hash;
}

export interface SaleRound extends SaleIdentity {
  readonly terms: SaleTerms;
  readonly state: SourceRoundState;
}

export interface DestinationSale extends SaleIdentity {
  readonly terms: SaleTerms;
  readonly state: DestinationState;
}

export interface SaleEventFields {
  readonly saleId: Hash;
  readonly claimId: bigint;
  readonly round: bigint;
  readonly termsHash: Hash;
}

export type SourceEvent =
  | {
      readonly name: "ClaimFunded";
      readonly claimId: bigint;
      readonly payer: Address;
      readonly beneficiary: Address;
      readonly token: Address;
      readonly faceValueRaw: bigint;
      readonly maturity: bigint;
      readonly referenceHash: Hash;
    }
  | ({ readonly name: "SaleReserved"; readonly terms: SaleTerms } & SaleEventFields)
  | ({ readonly name: "SaleAssigned" } & SaleEventFields)
  | ({ readonly name: "SaleCancelled" } & SaleEventFields)
  | {
      readonly name: "ClaimRedeemed";
      readonly claimId: bigint;
      readonly beneficiary: Address;
      readonly token: Address;
      readonly faceValueRaw: bigint;
    };
