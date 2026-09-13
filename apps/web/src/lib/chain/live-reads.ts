import { Interface, JsonRpcProvider } from "ethers";
import {
  destinationStates,
  sourceRoundStates,
  type DestinationState,
  type SourceRoundState,
} from "@morrow/protocol";
import { chains, type ChainKey } from "@/lib/explorers";
import { abis } from "./abis";
import { asBigInt, asBoolean, asString, resultField } from "./decoded";
import { deployments } from "./deployments";

export interface LiveClaim {
  readonly roundState: SourceRoundState;
  readonly saleState: DestinationState;
  readonly currentBeneficiary: string;
  readonly redeemed: boolean;
}

export interface LiveMarket {
  readonly totalBound: bigint;
  readonly totalCredits: bigint;
  readonly totalLiabilities: bigint;
  readonly totalBacking: bigint;
  readonly sourceBlock: number;
  readonly destinationBlock: number;
  readonly sourceTimestamp: bigint;
}

const interfaces = {
  vault: new Interface(abis.vault),
  market: new Interface(abis.market),
};

const providers: Record<ChainKey, JsonRpcProvider> = {
  sepolia: new JsonRpcProvider(chains.sepolia.rpc, chains.sepolia.evmChainId, {
    staticNetwork: true,
  }),
  cc3: new JsonRpcProvider(chains.cc3.rpc, chains.cc3.evmChainId, { staticNetwork: true }),
};

async function callView(
  chain: ChainKey,
  contract: "vault" | "market",
  method: string,
  args: readonly unknown[],
  blockTag: number,
): Promise<unknown> {
  const contractInterface = interfaces[contract];
  const address = contract === "vault" ? deployments.vault : deployments.market;
  const data = contractInterface.encodeFunctionData(method, args);
  const raw = await providers[chain].call({ to: address, data, blockTag });
  const decoded: unknown = contractInterface.decodeFunctionResult(method, raw)[0];
  return decoded;
}

function stateAt<T>(states: readonly T[], value: unknown): T | undefined {
  const index = asBigInt(value);
  return index === undefined ? undefined : states[Number(index)];
}

export async function readLiveMarket(): Promise<LiveMarket> {
  const [sourceBlock, destinationBlock] = await Promise.all([
    providers.sepolia.getBlock("latest"),
    providers.cc3.getBlock("latest"),
  ]);
  if (!sourceBlock || !destinationBlock) {
    throw new Error("Latest block unavailable");
  }
  const [totalBound, totalCredits, totalLiabilities, totalBacking] = await Promise.all([
    callView("cc3", "market", "totalBound", [], destinationBlock.number),
    callView("cc3", "market", "totalCredits", [], destinationBlock.number),
    callView("cc3", "market", "totalLiabilities", [], destinationBlock.number),
    callView("sepolia", "vault", "totalBacking", [], sourceBlock.number),
  ]);
  const values = [totalBound, totalCredits, totalLiabilities, totalBacking].map(asBigInt);
  const [bound, credits, liabilities, backing] = values;
  if (
    bound === undefined ||
    credits === undefined ||
    liabilities === undefined ||
    backing === undefined
  ) {
    throw new Error("Unexpected market accounting response");
  }
  return {
    totalBound: bound,
    totalCredits: credits,
    totalLiabilities: liabilities,
    totalBacking: backing,
    sourceBlock: sourceBlock.number,
    destinationBlock: destinationBlock.number,
    sourceTimestamp: BigInt(sourceBlock.timestamp),
  };
}

export async function readLiveClaim(
  claimId: bigint,
  round: bigint,
  saleId: string,
  market: LiveMarket,
): Promise<LiveClaim> {
  const [claim, sourceRound, sale] = await Promise.all([
    callView("sepolia", "vault", "getClaim", [claimId], market.sourceBlock),
    callView("sepolia", "vault", "getRound", [claimId, round], market.sourceBlock),
    callView("cc3", "market", "getSale", [saleId], market.destinationBlock),
  ]);
  const roundState = stateAt(sourceRoundStates, resultField(sourceRound, "state"));
  const saleState = stateAt(destinationStates, resultField(sale, "state"));
  const currentBeneficiary = asString(resultField(claim, "currentBeneficiary"));
  const redeemed = asBoolean(resultField(claim, "redeemed"));
  if (!roundState || !saleState || !currentBeneficiary || redeemed === undefined) {
    throw new Error("Unexpected claim state response");
  }
  return { roundState, saleState, currentBeneficiary, redeemed };
}

export async function readCredits(address: string, market: LiveMarket): Promise<bigint> {
  const value = asBigInt(
    await callView("cc3", "market", "credits", [address], market.destinationBlock),
  );
  if (value === undefined) {
    throw new Error("Unexpected credits response");
  }
  return value;
}

export function encodeWithdraw(): string {
  return interfaces.market.encodeFunctionData("withdraw", []);
}
