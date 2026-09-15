import { FetchRequest, JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { prepareAssignment } from "./preflight.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { ConfigurationError } from "./errors.ts";
import { actionAddress } from "./browser-action-policy.ts";

export { prepareAssignment } from "./preflight.ts";
export type {
  PreflightReaders,
  SourcePreflightRead,
  DestinationPreflightRead,
} from "./preflight.ts";
export { livePreflightReaders } from "./preflight-rpc.ts";
export { ConfigurationError } from "./errors.ts";
export { prepareBrowserReservation } from "./browser-reservation.ts";
export { prepareBrowserFundingApproval } from "./browser-approval.ts";
export { prepareBrowserFunding } from "./browser-funding.ts";
export { prepareBrowserSettlement } from "./browser-settlement.ts";
export { prepareBrowserWithdrawal } from "./browser-withdrawal.ts";
export { prepareBrowserSaleProof } from "./browser-proof.ts";
export { prepareBrowserFaucetDrip, assertDripAvailable } from "./browser-faucet.ts";
export type { FaucetStatus } from "./browser-faucet.ts";
export { faucetContracts } from "./faucet-pins.ts";
export type { FaucetSide } from "./faucet-pins.ts";
export {
  prepareBrowserClaimApproval,
  prepareBrowserClaim,
  assertClaimRequest,
  minimumMaturityLeadSeconds,
} from "./browser-claim.ts";
export type { ClaimRequest } from "./browser-claim.ts";
export {
  prepareBrowserCancellation,
  prepareBrowserCancellationRecognition,
} from "./browser-cancellation.ts";
export { prepareBrowserRedemption, assertRedeemable } from "./browser-redemption.ts";
export { readWalletActivity } from "./browser-sales.ts";
export {
  readSaleProgress,
  readClaimState,
  readMarketRules,
  readTokenBalances,
} from "./browser-sale-state.ts";
export type { SaleProgress } from "./browser-sale-state.ts";
export type { WalletClaim, WalletSale } from "./browser-sales.ts";
export { campaignContracts } from "./campaign-config.ts";
export { minimumAttestedDepth, tradeContracts } from "./trade-contracts.ts";
export { quoteEconomics, saleIdentity } from "./canonical.ts";
export { confirmPreparedWallet } from "./browser-action-policy.ts";
export type { WalletIdentityProvider } from "./browser-action-policy.ts";
export type { BrowserActionOptions } from "./browser-action-context.ts";
export type { BrowserProofInput } from "./browser-proof.ts";

export interface BrowserPreflightOptions {
  readonly sourceRpcUrl: string;
  readonly destinationRpcUrl: string;
  readonly fundingHash: string;
}

export function preflightProvider(url: string): JsonRpcProvider {
  const request = new FetchRequest(url);
  request.timeout = 12000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

export async function prepareBrowserAssignment(
  terms: SaleTerms,
  sellerAddress: string,
  connectedSourceChain: bigint,
  options: BrowserPreflightOptions,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(options.fundingHash))
    throw new ConfigurationError("Invalid funding transaction hash");
  const source = preflightProvider(options.sourceRpcUrl);
  try {
    const destination = preflightProvider(options.destinationRpcUrl);
    try {
      const prepared = await prepareAssignment(
        terms,
        sellerAddress,
        connectedSourceChain,
        livePreflightReaders(source, destination, terms, options.fundingHash),
      );
      return {
        ...prepared,
        action: "assign" as const,
        expectedSigner: actionAddress(sellerAddress),
        checkedAt: new Date().toISOString(),
        checkedBlock: prepared.sourceBlock,
        checkedBlockHash: prepared.sourceBlockHash as `0x${string}`,
        validBefore: terms.assignBefore,
      };
    } finally {
      destination.destroy();
    }
  } finally {
    source.destroy();
  }
}
