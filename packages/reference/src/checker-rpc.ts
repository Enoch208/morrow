import { fileURLToPath } from "node:url";
import { FetchRequest, Interface, JsonRpcProvider, Result } from "ethers";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import tokenAbi from "../../../schemas/abi/MorrowTestToken.json" with { type: "json" };
import nativeAbi from "../../../schemas/abi/BlockProver.json" with { type: "json" };
import { pins } from "./deployment-pins.ts";
export { pins } from "./deployment-pins.ts";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const interfaces = {
  market: new Interface(marketAbi),
  token: new Interface(tokenAbi),
  native: new Interface(nativeAbi),
};

export class EvidenceError extends Error {}

export function rpcPair() {
  const create = (url: string) => {
    const request = new FetchRequest(url);
    request.timeout = 12000;
    return new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  };
  return {
    source: create("https://ethereum-sepolia-rpc.publicnode.com"),
    destination: create("https://rpc.cc3-testnet.creditcoin.network"),
  };
}

export function tuple(value: unknown): Result {
  if (!(value instanceof Result)) throw new EvidenceError("Expected decoded ABI tuple");
  return value;
}

export function integer(value: unknown): bigint {
  if (typeof value !== "bigint") throw new EvidenceError("Expected decoded integer");
  return value;
}

export function hex(value: unknown): string {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value))
    throw new EvidenceError("Expected decoded hex");
  return value;
}

export async function read(
  rpc: JsonRpcProvider,
  kind: keyof typeof interfaces,
  method: string,
  args: readonly unknown[],
  blockTag: number | "finalized",
) {
  const iface = interfaces[kind];
  const to = pins[kind];
  const data = iface.encodeFunctionData(method, args);
  const raw = await rpc.call({ to, data, blockTag });
  return { raw, data, decoded: iface.decodeFunctionResult(method, raw) };
}
