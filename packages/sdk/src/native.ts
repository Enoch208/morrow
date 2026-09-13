import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Interface } from "ethers";
import type { JsonRpcProvider, Result } from "ethers";

const require = createRequire(import.meta.url);
export const nativeAddresses = {
  blockProver: "0x0000000000000000000000000000000000000FD2",
  chainInfo: "0x0000000000000000000000000000000000000fd3",
} as const;

export const nativeInterfaces = {
  blockProver: new Interface(
    readFileSync(require.resolve("@gluwa/usc-sdk/dist/block-prover/block_prover.json"), "utf8"),
  ),
  chainInfo: new Interface(
    readFileSync(require.resolve("@gluwa/usc-sdk/dist/chain-info/chain_info.json"), "utf8"),
  ),
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
