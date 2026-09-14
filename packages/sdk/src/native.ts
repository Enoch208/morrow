import { Interface } from "ethers";
import type { JsonRpcProvider, Result } from "ethers";
import blockProverAbi from "@gluwa/usc-sdk/dist/block-prover/block_prover.json" with { type: "json" };
import chainInfoAbi from "@gluwa/usc-sdk/dist/chain-info/chain_info.json" with { type: "json" };

export const nativeAddresses = {
  blockProver: "0x0000000000000000000000000000000000000FD2",
  chainInfo: "0x0000000000000000000000000000000000000fd3",
} as const;

export const nativeInterfaces = {
  blockProver: new Interface(blockProverAbi),
  chainInfo: new Interface(chainInfoAbi),
};

export async function readNative(
  rpc: JsonRpcProvider,
  kind: keyof typeof nativeInterfaces,
  method: string,
  arguments_: readonly unknown[] = [],
  blockTag: number | "finalized" = "finalized",
): Promise<{ calldata: string; raw: string; decoded: Result }> {
  const abi = nativeInterfaces[kind];
  const calldata = abi.encodeFunctionData(method, arguments_);
  const raw = await rpc.call({ to: nativeAddresses[kind], data: calldata, blockTag });
  return { calldata, raw, decoded: abi.decodeFunctionResult(method, raw) };
}
