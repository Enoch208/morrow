import { ContractFactory } from "ethers";
import type { TransactionRequest } from "ethers";
import { contractArtifact } from "./artifact.ts";
import { campaignActors } from "./campaign-config.ts";
import { contractInterfaces } from "./contract-reads.ts";
import {
  lockupInterface,
  refusalDepositRaw,
  sablierLockup,
  streamDepositRaw,
  streamDurationSeconds,
  streamFeeBps,
  streamTokens,
} from "./stream-config.ts";
import type { StreamStep } from "./stream-config.ts";
import { streamField } from "./stream-log.ts";

export const vaultInterface = contractArtifact("StreamPaymentVault").abi;

export type SetupStep = Extract<
  StreamStep,
  | "deploy-stream-vault"
  | "deploy-stream-market"
  | "approve-lockup"
  | "create-cancelable-stream"
  | "wrap-cancelable-refused"
  | "create-stream"
  | "approve-stream"
  | "wrap-stream"
>;

function deployment(name: string, args: readonly unknown[]) {
  const artifact = contractArtifact(name);
  return new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(...args);
}

function stream(recipient: string, cancelable: boolean, deposit: bigint) {
  return lockupInterface.encodeFunctionData("createWithDurationsLL", [
    [
      campaignActors.PAYER,
      recipient,
      deposit,
      streamTokens.source,
      cancelable,
      true,
      "morrow-stream",
    ],
    [0n, 0n],
    0n,
    [0n, streamDurationSeconds],
  ]);
}

export async function setupRequest(
  step: SetupStep,
  records: readonly Record<string, unknown>[],
): Promise<{ readonly request: TransactionRequest }> {
  const vault = () => streamField(records, "deploy-stream-vault", "contractAddress");
  switch (step) {
    case "deploy-stream-vault":
      return {
        request: await deployment("StreamPaymentVault", [streamTokens.source, sablierLockup]),
      };
    case "deploy-stream-market":
      return {
        request: await deployment("MorrowMarket", [
          streamTokens.settlement,
          vault(),
          streamTokens.source,
          campaignActors.PAYER,
          streamFeeBps,
        ]),
      };
    case "approve-lockup":
      return {
        request: {
          to: streamTokens.source,
          data: contractInterfaces.sourceToken.encodeFunctionData("approve", [
            sablierLockup,
            streamDepositRaw + refusalDepositRaw,
          ]),
        },
      };
    case "create-cancelable-stream":
      return {
        request: {
          to: sablierLockup,
          data: stream(campaignActors.SELLER, true, refusalDepositRaw),
        },
      };
    case "wrap-cancelable-refused":
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("wrapStream", [
            BigInt(streamField(records, "create-cancelable-stream", "streamId")),
            `0x${"00".repeat(32)}`,
          ]),
        },
      };
    case "create-stream":
      return {
        request: {
          to: sablierLockup,
          data: stream(campaignActors.SELLER, false, streamDepositRaw),
        },
      };
    case "approve-stream":
      return {
        request: {
          to: sablierLockup,
          data: lockupInterface.encodeFunctionData("approve", [
            vault(),
            BigInt(streamField(records, "create-stream", "streamId")),
          ]),
        },
      };
    case "wrap-stream":
      return {
        request: {
          to: vault(),
          data: vaultInterface.encodeFunctionData("wrapStream", [
            BigInt(streamField(records, "create-stream", "streamId")),
            `0x${"00".repeat(32)}`,
          ]),
        },
      };
  }
}
