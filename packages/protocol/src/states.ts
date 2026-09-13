export const sourceRoundStates = ["ABSENT", "RESERVED", "ASSIGNED", "CANCELLED"] as const;
export type SourceRoundState = (typeof sourceRoundStates)[number];

export const destinationStates = [
  "ABSENT",
  "BOUND",
  "ASSIGNED_CLAIMABLE",
  "CANCELLED_CLAIMABLE",
] as const;
export type DestinationState = (typeof destinationStates)[number];

export const evidenceLabels = [
  "proposed",
  "local-tested",
  "abstract-model",
  "fork-tested",
  "live-read-verified",
  "live-testnet-mined",
  "historical-replay",
  "user-observed",
  "blocked",
] as const;
export type EvidenceLabel = (typeof evidenceLabels)[number];

export const stateLanguage = {
  SOURCE_RESERVED: "Source reserved",
  WAITING_FOR_ATTESTATION: "Waiting for attestation",
  EVIDENCE_UNAVAILABLE: "Evidence unavailable",
  DESTINATION_FUNDED: "Destination funded",
  ASSIGNED_ON_SOURCE: "Assigned on source",
  SELLER_FUNDS_CLAIMABLE: "Seller funds claimable",
  SELLER_PAID: "Seller paid",
  REFUND_CLAIMABLE: "Refund claimable",
  REFUND_WITHDRAWN: "Refund withdrawn",
} as const;
export type DisplayState = keyof typeof stateLanguage;
export type VerificationStatus = "VERIFIED" | "REJECTED" | "UNVERIFIABLE";

export type ReadResult<T> =
  | {
      readonly status: "available";
      readonly value: T;
      readonly observedAt: string;
      readonly blockNumber: bigint;
      readonly blockHash: `0x${string}`;
    }
  | { readonly status: "unverifiable"; readonly reason: string; readonly observedAt: string }
  | { readonly status: "pending"; readonly reason: string };
