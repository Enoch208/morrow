import { Interface } from "ethers";
import type { campaignActors } from "./campaign-config.ts";
import { campaignContracts } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

export const sablierLockup = "0xe61cb9153356419bdaD0A8767c059f92d221a3C4";
export const streamDepositRaw = 10_000_000_000n;
export const refusalDepositRaw = 1_000_000n;
export const streamDurationSeconds = 14_400n;
export const streamPriceRaw = 9_410_000_000n;
export const streamFeeBps = 50n;
export const fundWindowSeconds = 3_600n;
export const assignWindowSeconds = 7_200n;

export const lockupInterface = new Interface([
  "function createWithDurationsLL((address sender,address recipient,uint128 depositAmount,address token,bool cancelable,bool transferable,string shape) params,(uint128 start,uint128 cliff) unlockAmounts,uint40 granularity,(uint40 cliff,uint40 total) durations) payable returns (uint256)",
  "function approve(address to,uint256 streamId)",
  "function ownerOf(uint256 streamId) view returns (address)",
  "function nextStreamId() view returns (uint256)",
  "function isCancelable(uint256 streamId) view returns (bool)",
  "function isDepleted(uint256 streamId) view returns (bool)",
  "function getWithdrawnAmount(uint256 streamId) view returns (uint128)",
  "function getEndTime(uint256 streamId) view returns (uint40)",
]);

export const streamSteps = [
  "deploy-stream-vault",
  "deploy-stream-market",
  "approve-lockup",
  "create-cancelable-stream",
  "wrap-cancelable-refused",
  "create-stream",
  "approve-stream",
  "wrap-stream",
  "reserve",
  "approve-fund",
  "fund",
  "assign",
  "settle",
  "withdraw-seller",
  "redeem",
] as const;
export type StreamStep = (typeof streamSteps)[number];

export function streamStep(input: string | undefined): StreamStep {
  const step = streamSteps.find((candidate) => candidate === input);
  if (!step) throw new ConfigurationError(`Choose ${streamSteps.join(", ")}`);
  return step;
}

export const streamSigner = {
  "deploy-stream-vault": "PAYER",
  "deploy-stream-market": "PAYER",
  "approve-lockup": "PAYER",
  "create-cancelable-stream": "PAYER",
  "wrap-cancelable-refused": "SELLER",
  "create-stream": "PAYER",
  "approve-stream": "SELLER",
  "wrap-stream": "SELLER",
  reserve: "SELLER",
  "approve-fund": "BUYER",
  fund: "BUYER",
  assign: "SELLER",
  settle: "SELLER",
  "withdraw-seller": "SELLER",
  redeem: "BUYER",
} as const satisfies Record<StreamStep, keyof typeof campaignActors>;

export function streamChain(step: StreamStep): bigint {
  return ["deploy-stream-market", "approve-fund", "fund", "settle", "withdraw-seller"].includes(
    step,
  )
    ? 102031n
    : 11155111n;
}

export const expectedRefusal: Partial<Record<StreamStep, string>> = {
  "wrap-cancelable-refused": "UnsupportedStream",
};

export const streamTokens = {
  source: campaignContracts.sourceToken.address,
  settlement: campaignContracts.settlementToken.address,
} as const;
