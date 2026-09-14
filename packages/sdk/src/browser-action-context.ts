import { FetchRequest, JsonRpcProvider } from "ethers";
import type { Block } from "ethers";
import type { PreparedAction, PreparedTransaction, SaleTerms } from "@morrow/protocol";
import { campaignContracts } from "./campaign-config.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { decodedAddress, decodedInteger } from "./decoded-state.ts";
import { actionAddress } from "./browser-action-policy.ts";
import { ConfigurationError } from "./errors.ts";

export interface BrowserActionOptions {
  readonly sourceRpcUrl: string;
  readonly destinationRpcUrl: string;
}
export interface BrowserActionContext {
  readonly source: JsonRpcProvider;
  readonly destination: JsonRpcProvider;
}

function provider(url: string): JsonRpcProvider {
  const request = new FetchRequest(url);
  request.timeout = 12000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

export async function withBrowserAction<T>(
  options: BrowserActionOptions,
  run: (context: BrowserActionContext) => Promise<T>,
): Promise<T> {
  const source = provider(options.sourceRpcUrl);
  try {
    const destination = provider(options.destinationRpcUrl);
    try {
      return await run({ source, destination });
    } finally {
      destination.destroy();
    }
  } finally {
    source.destroy();
  }
}

export function assertFreshTimestamp(timestamp: bigint, cutoff?: bigint): void {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now - timestamp > 120n || timestamp - now > 30n)
    throw new ConfigurationError("Action snapshot timestamp is stale or inconsistent");
  if (cutoff !== undefined && (timestamp >= cutoff || now >= cutoff))
    throw new ConfigurationError("Action admission deadline reached");
}

export async function actionBlock(
  rpc: JsonRpcProvider,
  side: "source" | "destination",
): Promise<Block> {
  const block = await rpc.getBlock("latest");
  if (!block?.hash) throw new ConfigurationError("Action block unavailable");
  assertFreshTimestamp(BigInt(block.timestamp));
  await Promise.all(
    (side === "source"
      ? (["vault", "sourceToken"] as const)
      : (["market", "settlementToken"] as const)
    ).map((key) => verifyCampaignContract(rpc, key, block.number)),
  );
  return block;
}

export async function checkMarketConfiguration(
  rpc: JsonRpcProvider,
  terms: SaleTerms,
  block: number,
): Promise<void> {
  const [fee, recipient] = await Promise.all([
    campaignRead(rpc, "market", "FEE_BPS", [], block),
    campaignRead(rpc, "market", "FEE_RECIPIENT", [], block),
  ]);
  if (
    decodedInteger(fee.decoded[0]) !== terms.feeBps ||
    decodedAddress(recipient.decoded[0]) !== actionAddress(terms.feeRecipient)
  )
    throw new ConfigurationError("Terms differ from immutable market fee rules");
}

export interface PreparationTarget {
  readonly address: string;
  readonly chainId: bigint;
}

export function finishPreparation(
  rpc: JsonRpcProvider,
  block: Block,
  action: PreparedAction,
  actor: string,
  key: keyof typeof campaignContracts,
  data: string,
  cutoff?: bigint,
): Promise<PreparedTransaction> {
  return finishPreparationFor(rpc, block, action, actor, campaignContracts[key], data, cutoff);
}

export async function finishPreparationFor(
  rpc: JsonRpcProvider,
  block: Block,
  action: PreparedAction,
  actor: string,
  target: PreparationTarget,
  data: string,
  cutoff?: bigint,
): Promise<PreparedTransaction> {
  assertFreshTimestamp(BigInt(block.timestamp), cutoff);
  await rpc.call({ to: target.address, from: actor, data, blockTag: block.number });
  if ((await rpc.getBlock(block.number))?.hash !== block.hash || !block.hash)
    throw new ConfigurationError("Action snapshot reorganized");
  assertFreshTimestamp(BigInt(block.timestamp), cutoff);
  return {
    action,
    expectedSigner: actionAddress(actor),
    chainId: target.chainId,
    to: actionAddress(target.address),
    data,
    checkedAt: new Date().toISOString(),
    checkedBlock: block.number,
    checkedBlockHash: block.hash as `0x${string}`,
    ...(cutoff === undefined ? {} : { validBefore: cutoff }),
  };
}
