import { FetchRequest, JsonRpcProvider } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { prepareAssignment } from "./preflight.ts";
import { livePreflightReaders } from "./preflight-rpc.ts";
import { ConfigurationError } from "./errors.ts";

export { prepareAssignment } from "./preflight.ts";
export type {
  PreflightReaders,
  SourcePreflightRead,
  DestinationPreflightRead,
} from "./preflight.ts";
export { livePreflightReaders } from "./preflight-rpc.ts";
export { ConfigurationError } from "./errors.ts";

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
      return await prepareAssignment(
        terms,
        sellerAddress,
        connectedSourceChain,
        livePreflightReaders(source, destination, terms, options.fundingHash),
      );
    } finally {
      destination.destroy();
    }
  } finally {
    source.destroy();
  }
}
