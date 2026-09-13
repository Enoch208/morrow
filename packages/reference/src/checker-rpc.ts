import { fileURLToPath } from "node:url";
import { FetchRequest, Interface, JsonRpcProvider, Result } from "ethers";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import tokenAbi from "../../../schemas/abi/MorrowTestToken.json" with { type: "json" };
import nativeAbi from "../../../schemas/abi/BlockProver.json" with { type: "json" };

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const interfaces = {
  market: new Interface(marketAbi),
  token: new Interface(tokenAbi),
  native: new Interface(nativeAbi),
};
export const pins = {
  vault: "0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583",
  sourceToken: "0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9",
  market: "0x7c3310280083eE63e32427D11d0A7C2CAf584474",
  token: "0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0",
  sourceCodeHash: "0x0d92b51fec0c1d28e34b701b0f41a56675b2fa2c52ec6097c5100660f31a4560",
  marketCodeHash: "0x8104de85a27582fa15cea674c7f19e19a69041586f509b982413b9dead287751",
  tokenCodeHash: "0x2ebb03f50ccc7b228f8b7eaa868e81f7edbdd47cf4dd98f1dff2655a683ef65e",
  native: "0x0000000000000000000000000000000000000FD2",
} as const;

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
