import { Interface, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import faucetAbi from "../../../schemas/abi/MorrowTestFaucet.json" with { type: "json" };
import { campaignContracts } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

export const faucetInterface = new Interface(faucetAbi);

export const faucetContracts = {
  source: {
    address: "0x4de0e4C567E5CE1A6ffDa95fb539AF6057878025",
    chainId: 11155111n,
    token: campaignContracts.sourceToken.address,
    codeHash: "0xe3831014666df8e5c3ac665b2814e04844ad067de3c2bf299093e4430fd9aadb",
  },
  settlement: {
    address: "0x5dAC910797f35F1baEED282f753DE4803484ad3B",
    chainId: 102031n,
    token: campaignContracts.settlementToken.address,
    codeHash: "0x2b2d55135fc4f9ed5b63ff788445ea3e39372744e4785cabcc4a222ccfef7d82",
  },
} as const;

export type FaucetSide = keyof typeof faucetContracts;

export async function verifyFaucet(rpc: JsonRpcProvider, side: FaucetSide, block: number) {
  const pin = faucetContracts[side];
  if ((await rpc.getNetwork()).chainId !== pin.chainId)
    throw new ConfigurationError("Faucet chain mismatch");
  if (keccak256(await rpc.getCode(pin.address, block)) !== pin.codeHash)
    throw new ConfigurationError("Pinned faucet runtime mismatch");
  return pin;
}

export async function faucetRead(
  rpc: JsonRpcProvider,
  side: FaucetSide,
  method: string,
  args: readonly unknown[],
  block: number,
): Promise<unknown> {
  const raw = await rpc.call({
    to: faucetContracts[side].address,
    data: faucetInterface.encodeFunctionData(method, args),
    blockTag: block,
  });
  const [value]: unknown[] = faucetInterface.decodeFunctionResult(method, raw);
  return value;
}
