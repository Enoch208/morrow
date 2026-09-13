import { AbiCoder, Interface, isError } from "ethers";
import type { ChainKey } from "@/lib/explorers";
import { abis } from "./abis";
import { providers } from "./providers";

export type ReplayOutcome =
  | { readonly kind: "rejected"; readonly error: string; readonly block: number }
  | { readonly kind: "accepted"; readonly block: number }
  | { readonly kind: "unverifiable"; readonly reason: string };

const errorInterfaces = [new Interface(abis.market), new Interface(abis.vault)];
const stringRevertSelector = "0x08c379a0";

function decodeRevert(data: string): string {
  if (data.startsWith(stringRevertSelector)) {
    const [reason] = AbiCoder.defaultAbiCoder().decode(["string"], `0x${data.slice(10)}`);
    return typeof reason === "string" ? reason : data.slice(0, 10);
  }
  for (const contractInterface of errorInterfaces) {
    const parsed = contractInterface.parseError(data);
    if (parsed) {
      return parsed.name;
    }
  }
  return `Unrecognized revert ${data.slice(0, 10)}`;
}

export async function replayCall(
  chain: ChainKey,
  to: string,
  data: string,
  blockTag: number | "latest",
): Promise<ReplayOutcome> {
  const provider = providers[chain];
  const block = blockTag === "latest" ? await provider.getBlockNumber() : blockTag;
  try {
    await provider.call({ to, data, blockTag: block });
    return { kind: "accepted", block };
  } catch (error) {
    if (
      isError(error, "CALL_EXCEPTION") &&
      typeof error.data === "string" &&
      error.data.length >= 10
    ) {
      return { kind: "rejected", error: decodeRevert(error.data), block };
    }
    return {
      kind: "unverifiable",
      reason: error instanceof Error ? error.message.slice(0, 160) : "RPC request failed",
    };
  }
}

export type NativeVerifyOutcome =
  | { readonly kind: "returned"; readonly verified: boolean; readonly block: number }
  | { readonly kind: "rejected"; readonly error: string; readonly block: number }
  | { readonly kind: "unverifiable"; readonly reason: string };

const blockProverAddress = "0x0000000000000000000000000000000000000FD2";
const proverInterface = new Interface(abis.prover);

export async function callNativeVerify(
  data: string,
  blockTag: number | "latest",
): Promise<NativeVerifyOutcome> {
  const block = blockTag === "latest" ? await providers.cc3.getBlockNumber() : blockTag;
  try {
    const raw = await providers.cc3.call({ to: blockProverAddress, data, blockTag: block });
    const decoded: unknown = proverInterface.decodeFunctionResult(data.slice(0, 10), raw)[0];
    if (typeof decoded !== "boolean") {
      return { kind: "unverifiable", reason: "Unexpected verifier response" };
    }
    return { kind: "returned", verified: decoded, block };
  } catch (error) {
    if (
      isError(error, "CALL_EXCEPTION") &&
      typeof error.data === "string" &&
      error.data.length >= 10
    ) {
      return { kind: "rejected", error: decodeRevert(error.data), block };
    }
    return {
      kind: "unverifiable",
      reason: error instanceof Error ? error.message.slice(0, 160) : "RPC request failed",
    };
  }
}
