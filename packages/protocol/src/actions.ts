import type { Address, Hash } from "./terms.ts";

export type PreparedAction = "reserve" | "approve" | "fund" | "assign" | "settle" | "withdraw";

export interface PreparedTransaction {
  readonly action: PreparedAction;
  readonly expectedSigner: Address;
  readonly chainId: bigint;
  readonly to: Address;
  readonly data: string;
  readonly checkedAt: string;
  readonly checkedBlock: number;
  readonly checkedBlockHash: Hash;
  readonly validBefore?: bigint;
}

export type ProofProgress =
  | { readonly phase: "awaiting-finality" | "awaiting-attestation"; readonly sourceBlock: number }
  | { readonly phase: "requesting" | "verifying"; readonly transactionHash: Hash }
  | { readonly phase: "verified"; readonly transactionHash: Hash; readonly checkedBlock: number }
  | { readonly phase: "unavailable" | "refused"; readonly reason: string };
