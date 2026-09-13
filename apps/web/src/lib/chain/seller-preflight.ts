import type { SaleTerms } from "@morrow/protocol";
import { ConfigurationError, prepareBrowserAssignment } from "@morrow/sdk/browser";
import { chains } from "@/lib/explorers";

export interface PreparedAssignment {
  readonly to: string;
  readonly data: string;
  readonly sellerNetRaw: bigint;
  readonly feeRaw: bigint;
  readonly sourceBlock: number;
  readonly sourceBlockHash: string;
  readonly destinationBlock: number;
  readonly destinationBlockHash: string;
}

export type PreflightOutcome =
  | { readonly kind: "passed"; readonly prepared: PreparedAssignment; readonly checkedAt: string }
  | { readonly kind: "refused"; readonly reason: string; readonly checkedAt: string }
  | { readonly kind: "unverifiable"; readonly reason: string; readonly checkedAt: string };

export async function runSellerPreflight(
  terms: SaleTerms,
  sellerAddress: string,
  connectedChainId: bigint,
  fundingHash: string,
): Promise<PreflightOutcome> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await prepareBrowserAssignment(terms, sellerAddress, connectedChainId, {
      sourceRpcUrl: chains.sepolia.rpc,
      destinationRpcUrl: chains.cc3.rpc,
      fundingHash,
    });
    return {
      kind: "passed",
      checkedAt,
      prepared: {
        to: result.to,
        data: result.data,
        sellerNetRaw: result.sellerNetRaw,
        feeRaw: result.feeRaw,
        sourceBlock: result.sourceBlock,
        sourceBlockHash: result.sourceBlockHash,
        destinationBlock: result.destinationBlock,
        destinationBlockHash: result.destinationBlockHash,
      },
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { kind: "refused", reason: error.message, checkedAt };
    }
    return {
      kind: "unverifiable",
      reason: error instanceof Error ? error.message.slice(0, 180) : "Preflight read failed",
      checkedAt,
    };
  }
}
