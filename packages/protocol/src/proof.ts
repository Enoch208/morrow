import type { Hash, Hex } from "./terms.ts";

export interface ProofEnvelope {
  readonly chainKey: bigint;
  readonly blockHeight: bigint;
  readonly encodedTransaction: Hex;
  readonly merkleProof: {
    readonly root: Hash;
    readonly siblings: readonly { readonly hash: Hash; readonly isLeft: boolean }[];
  };
  readonly continuityProof: {
    readonly lowerEndpointDigest: Hash;
    readonly roots: readonly Hash[];
  };
}
